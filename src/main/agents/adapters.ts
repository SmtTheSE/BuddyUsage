import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { exeName } from './processScan'

/**
 * What BuddyUsage knows about each CLI agent beyond its usage page: how to
 * recognise its process, where it keeps conversations (so a nudge or resume
 * can target the right one), and how to talk to it headlessly. One entry
 * per provider that has a local CLI; providers without one (Cursor,
 * Copilot) simply have no adapter.
 */
export interface AgentAdapter {
  providerId: string
  /** Short name of the CLI, for labels and commands. */
  cli: string
  /** Does this process belong to the CLI? `exe` is argv[0], `command` the full line. */
  matches: (exe: string, command: string) => boolean
  /** The most recently used conversation id for a working directory, if the CLI keeps one. */
  latestSessionId: (cwd: string) => Promise<string | undefined>
  /**
   * Conversations touched in the last few minutes, newest first — how a
   * session learns its project on Windows, where the OS won't tell us a
   * process's working directory.
   */
  recentConversations: () => Promise<RecentConversation[]>
  /** Headless follow-up: continue `sessionId` (or the latest) with `text` and print the reply. */
  nudgeCommand: (sessionId: string | undefined, text: string) => { file: string; args: string[] }
  /** Interactive resume, as a shell line for a fresh terminal. */
  resumeCommand: (sessionId: string | undefined) => string
  /** Where hook events can be wired in, or why they cannot. */
  hooks: 'claude-settings' | 'codex-notify' | 'gemini-settings'
}

export interface RecentConversation {
  cwd: string
  sessionId?: string
  mtime: number
}

const home = homedir()
const RECENT_WINDOW_MS = 10 * 60 * 1000

async function claudeRecent(): Promise<RecentConversation[]> {
  const root = join(home, '.claude', 'projects')
  const out: RecentConversation[] = []
  let dirs: string[]
  try {
    dirs = await readdir(root)
  } catch {
    return out
  }
  const cutoff = Date.now() - RECENT_WINDOW_MS
  for (const dir of dirs) {
    const name = await newestFile(join(root, dir), (n) => /^[0-9a-f-]{36}\.jsonl$/i.test(n))
    if (!name) continue
    const path = join(root, dir, name)
    try {
      const info = await stat(path)
      if (info.mtimeMs < cutoff) continue
      // Every record carries the cwd; the first line is enough.
      const head = (await readFile(path, 'utf8')).split('\n', 1)[0]
      const cwd = (JSON.parse(head) as { cwd?: string }).cwd
      if (cwd) out.push({ cwd, sessionId: name.replace(/\.jsonl$/, ''), mtime: info.mtimeMs })
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** claude.ai encodes a project path by replacing every non-alphanumeric character with "-". */
function claudeProjectDir(cwd: string): string {
  return join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9-]/g, '-'))
}

async function newestFile(dir: string, filter: (name: string) => boolean): Promise<string | undefined> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return undefined
  }
  let best: { name: string; mtime: number } | undefined
  for (const name of names) {
    if (!filter(name)) continue
    try {
      const info = await stat(join(dir, name))
      if (info.isFile() && (!best || info.mtimeMs > best.mtime)) best = { name, mtime: info.mtimeMs }
    } catch {
      /* raced with deletion */
    }
  }
  return best?.name
}

export const claudeAdapter: AgentAdapter = {
  providerId: 'claude',
  cli: 'claude',
  // The native binary is literally "claude" (the desktop app is "Claude",
  // case matters); the npm install runs cli.js under node.
  matches: (exe, command) => exeName(exe) === 'claude' || /@anthropic-ai\/claude-code\/cli\.js/.test(command),
  latestSessionId: async (cwd) => {
    // Sub-agent transcripts are "agent-<id>.jsonl"; the conversation is the bare uuid.
    const name = await newestFile(claudeProjectDir(cwd), (n) => /^[0-9a-f-]{36}\.jsonl$/i.test(n))
    return name?.replace(/\.jsonl$/, '')
  },
  nudgeCommand: (sessionId, text) => ({
    file: 'claude',
    args: sessionId ? ['-p', '--resume', sessionId, '--output-format', 'text', text] : ['-p', '--continue', text]
  }),
  resumeCommand: (sessionId) => (sessionId ? `claude --resume ${sessionId}` : 'claude --continue'),
  recentConversations: claudeRecent,
  hooks: 'claude-settings'
}

/** Codex rollouts: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl, first line = session_meta with cwd. */
async function codexRollouts(daysBack: number): Promise<RecentConversation[]> {
  const root = join(home, '.codex', 'sessions')
  const out: RecentConversation[] = []
  for (let back = 0; back < daysBack; back++) {
    const d = new Date(Date.now() - back * 86_400_000)
    const dir = join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(dir, name)
      try {
        const info = await stat(path)
        const head = (await readFile(path, 'utf8')).split('\n', 1)[0]
        const meta = JSON.parse(head) as { type?: string; payload?: { id?: string; cwd?: string; thread_source?: string } }
        if (meta.type !== 'session_meta' || !meta.payload?.id || !meta.payload.cwd) continue
        if (meta.payload.thread_source === 'subagent') continue
        out.push({ cwd: meta.payload.cwd, sessionId: meta.payload.id, mtime: info.mtimeMs })
      } catch {
        /* partial write or not a rollout */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

async function codexLatestSession(cwd: string): Promise<string | undefined> {
  return (await codexRollouts(3)).find((r) => r.cwd === cwd)?.sessionId
}

export const codexAdapter: AgentAdapter = {
  providerId: 'chatgpt',
  cli: 'codex',
  matches: (exe, command) => exeName(exe) === 'codex' || /@openai\/codex\//.test(command),
  latestSessionId: codexLatestSession,
  nudgeCommand: (sessionId, text) => ({
    file: 'codex',
    args: sessionId ? ['exec', 'resume', sessionId, text] : ['exec', 'resume', '--last', text]
  }),
  resumeCommand: (sessionId) => (sessionId ? `codex resume ${sessionId}` : 'codex resume --last'),
  recentConversations: async () => (await codexRollouts(1)).filter((r) => r.mtime > Date.now() - RECENT_WINDOW_MS),
  hooks: 'codex-notify'
}

export const geminiAdapter: AgentAdapter = {
  providerId: 'gemini',
  cli: 'gemini',
  matches: (exe, command) => exeName(exe) === 'gemini' || /@google\/gemini-cli\//.test(command),
  // Gemini keys sessions by project directory and resumes "latest" itself.
  latestSessionId: async () => undefined,
  nudgeCommand: (_sessionId, text) => ({ file: 'gemini', args: ['--resume', 'latest', '-p', text] }),
  resumeCommand: () => 'gemini --resume latest',
  recentConversations: async () => [],
  hooks: 'gemini-settings'
}

export const agentAdapters: AgentAdapter[] = [claudeAdapter, codexAdapter, geminiAdapter]

export function adapterFor(providerId: string): AgentAdapter | undefined {
  return agentAdapters.find((a) => a.providerId === providerId)
}
