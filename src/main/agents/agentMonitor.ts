import { watch, type FSWatcher } from 'fs'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import type { AgentAttention, AgentSession, AgentsState, PausedSession } from '@shared/types'
import { providerRegistry } from '../providers/registry'
import { agentAdapters, adapterFor, type AgentAdapter } from './adapters'
import { findHostApp, listProcesses, lookupCwds, type ScannedProcess } from './processScan'

/**
 * Live view of the CLI agents on this machine. Two inputs, one list:
 *   - a process scan every few seconds says which sessions exist, in which
 *     project, started when;
 *   - hook events (see localServer.ts) say when one of them needs the user
 *     (permission prompt, idle) or has finished.
 * Everything the UI, the limit guard and the phone page show comes from
 * `getAgentsState()`; changes are pushed through `onAgentsChanged`.
 */

const SCAN_INTERVAL_MS = 5_000
// A hook-only entry (event arrived but no matching process — e.g. the scan
// missed it, or it was a headless run) is kept this long.
const HOOK_ONLY_TTL_MS = 10 * 60 * 1000
// Transcript activity within this window of an event is the CLI flushing
// the event itself, not the user coming back.
const ACTIVITY_GRACE_MS = 3_000
const FINISHED_TTL_MS = 30 * 60 * 1000

interface HostInfo {
  app?: string
  pid?: number
}

export interface InternalSession extends AgentSession {
  hostPid?: number
  lastSeenAt: number
}

const sessions = new Map<string, InternalSession>()
let paused: PausedSession[] = []
let scanAvailable = true
let scanTimer: NodeJS.Timeout | undefined
let scanning = false
const watchers: FSWatcher[] = []
/** pids BuddyUsage itself spawned (nudges) — never shown as user sessions. */
const ownPids = new Set<number>()

type Listener = (state: AgentsState) => void
const listeners = new Set<Listener>()

export function onAgentsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  const state = getAgentsState()
  for (const listener of listeners) listener(state)
}

export function registerOwnPid(pid: number): () => void {
  ownPids.add(pid)
  return () => ownPids.delete(pid)
}

function publicSession(s: InternalSession): AgentSession {
  const { hostPid: _hostPid, lastSeenAt: _seen, ...rest } = s
  return rest
}

export function getAgentsState(): AgentsState {
  const list = [...sessions.values()]
    .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
    .map(publicSession)
  return { sessions: list, paused, scanAvailable }
}

export function getSession(id: string): InternalSession | undefined {
  return sessions.get(id)
}

export function sessionsFor(providerId: string): InternalSession[] {
  return [...sessions.values()].filter((s) => s.providerId === providerId && s.pid !== undefined)
}

// ---------------------------------------------------------------------------
// Process scan
// ---------------------------------------------------------------------------

function isAgentProcess(proc: ScannedProcess): AgentAdapter | undefined {
  if (proc.pid === process.pid || ownPids.has(proc.pid)) return undefined
  return agentAdapters.find((a) => a.matches(proc.exe, proc.command))
}

async function scan(): Promise<void> {
  if (scanning) return
  scanning = true
  try {
    const procs = await listProcesses()
    scanAvailable = procs.length > 0
    if (!scanAvailable) return

    const byPid = new Map(procs.map((p) => [p.pid, p]))
    const found: { proc: ScannedProcess; adapter: AgentAdapter }[] = []
    for (const proc of procs) {
      const adapter = isAgentProcess(proc)
      if (adapter) found.push({ proc, adapter })
    }
    // Node-based installs show as a parent+child pair; keep only the outermost.
    const agentPids = new Set(found.map((f) => f.proc.pid))
    const roots = found.filter((f) => !agentPids.has(f.proc.ppid))

    const cwds = await lookupCwds(roots.filter((f) => !sessions.get(`${f.adapter.providerId}:${f.proc.pid}`)?.cwd).map((f) => f.proc.pid))

    const seen = new Set<string>()
    let changed = false
    for (const { proc, adapter } of roots) {
      const id = `${adapter.providerId}:${proc.pid}`
      seen.add(id)
      let session = sessions.get(id)
      if (!session) {
        const host = hostFor(proc.pid, byPid)
        session = {
          id,
          providerId: adapter.providerId,
          pid: proc.pid,
          startedAt: proc.startedAt,
          hostApp: host.app,
          hostPid: host.pid,
          state: 'running',
          lastSeenAt: Date.now()
        }
        sessions.set(id, session)
        // A hook-only entry for the same conversation is superseded.
        changed = true
      }
      session.lastSeenAt = Date.now()
      const cwd = cwds.get(proc.pid)
      if (cwd && session.cwd !== cwd) {
        session.cwd = cwd
        session.project = basename(cwd)
        changed = true
      }
      if (session.cwd && !session.sessionId) {
        const sid = await adapter.latestSessionId(session.cwd).catch(() => undefined)
        if (sid) {
          session.sessionId = sid
          changed = true
          changed = adoptHookOnly(session) || changed
        }
      }
    }

    // Sessions the OS gave no cwd for (Windows): pair them with the
    // conversations touched most recently, newest session first.
    for (const adapter of agentAdapters) {
      const unknown = [...sessions.values()]
        .filter((s) => s.providerId === adapter.providerId && s.pid !== undefined && !s.cwd)
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
      if (unknown.length === 0) continue
      const taken = new Set([...sessions.values()].map((s) => s.cwd).filter(Boolean))
      const recent = (await adapter.recentConversations().catch(() => [])).filter((r) => !taken.has(r.cwd))
      unknown.forEach((s, i) => {
        const r = recent[i]
        if (!r) return
        s.cwd = r.cwd
        s.project = basename(r.cwd)
        s.sessionId = s.sessionId ?? r.sessionId
        changed = true
      })
    }

    for (const [id, session] of sessions) {
      if (session.pid !== undefined && !seen.has(id)) {
        sessions.delete(id)
        changed = true
      }
    }
    if (expireStale()) changed = true
    if (changed) emit()
  } finally {
    scanning = false
  }
}

function hostFor(pid: number, byPid: Map<number, ScannedProcess>): HostInfo {
  const app = findHostApp(pid, byPid)
  if (!app) return {}
  // Find the pid of that host process for platforms that activate by pid.
  let current = byPid.get(byPid.get(pid)?.ppid ?? -1)
  for (let depth = 0; current && depth < 12; depth++) {
    if (current.exe === app || current.exe.startsWith(app)) return { app, pid: current.pid }
    current = byPid.get(current.ppid)
  }
  return { app }
}

/** When a process learns its conversation id, fold any hook-only entry for that id into it. */
function adoptHookOnly(session: InternalSession): boolean {
  const hookId = `${session.providerId}:hook:${session.sessionId}`
  const orphan = sessions.get(hookId)
  if (!orphan) return false
  sessions.delete(hookId)
  if (orphan.attention && !session.attention) {
    session.attention = orphan.attention
    session.state = 'attention'
  }
  return true
}

function expireStale(): boolean {
  const now = Date.now()
  let changed = false
  for (const [id, s] of sessions) {
    if (s.pid === undefined && now - s.lastSeenAt > HOOK_ONLY_TTL_MS) {
      sessions.delete(id)
      changed = true
    } else if (s.attention?.kind === 'finished' && now - new Date(s.attention.at).getTime() > FINISHED_TTL_MS) {
      s.attention = undefined
      s.state = 'running'
      changed = true
    }
  }
  return changed
}

// ---------------------------------------------------------------------------
// Hook events
// ---------------------------------------------------------------------------

export interface HookEvent {
  providerId: string
  sessionId?: string
  cwd?: string
  kind: 'attention' | 'clear'
  attention?: AgentAttention
}

/** Which session a hook event is about: same conversation id, else same project, else a hook-only entry. */
function targetFor(event: HookEvent): InternalSession {
  const candidates = [...sessions.values()].filter((s) => s.providerId === event.providerId)
  const byId = event.sessionId && candidates.find((s) => s.sessionId === event.sessionId)
  if (byId) return byId
  const byCwd =
    event.cwd &&
    candidates
      .filter((s) => s.pid !== undefined && s.cwd === event.cwd)
      .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0]
  if (byCwd) {
    if (event.sessionId && !byCwd.sessionId) byCwd.sessionId = event.sessionId
    return byCwd
  }
  // Windows has no cwd lookup; a lone process of that provider is the best match.
  const lone = candidates.filter((s) => s.pid !== undefined)
  if (lone.length === 1 && !lone[0].cwd) {
    if (event.cwd) {
      lone[0].cwd = event.cwd
      lone[0].project = basename(event.cwd)
    }
    if (event.sessionId) lone[0].sessionId = event.sessionId
    return lone[0]
  }
  const id = `${event.providerId}:hook:${event.sessionId ?? event.cwd ?? 'unknown'}`
  let entry = sessions.get(id)
  if (!entry) {
    entry = {
      id,
      providerId: event.providerId,
      cwd: event.cwd,
      project: event.cwd ? basename(event.cwd) : undefined,
      sessionId: event.sessionId,
      state: 'running',
      lastSeenAt: Date.now()
    }
    sessions.set(id, entry)
  }
  return entry
}

export function ingestHookEvent(event: HookEvent): InternalSession {
  const session = targetFor(event)
  session.lastSeenAt = Date.now()
  if (event.kind === 'attention' && event.attention) {
    session.attention = event.attention
    session.state = 'attention'
  } else if (event.kind === 'clear') {
    session.attention = undefined
    session.state = 'running'
  }
  emit()
  return session
}

/** Transcript activity means the CLI is working again — the wait is over. */
function onActivity(providerId: string): void {
  const now = Date.now()
  let changed = false
  for (const s of sessions.values()) {
    if (s.providerId !== providerId || !s.attention) continue
    if (now - new Date(s.attention.at).getTime() < ACTIVITY_GRACE_MS) continue
    if (s.attention.kind === 'finished') continue // stays until the user replies or it ages out
    s.attention = undefined
    s.state = 'running'
    changed = true
  }
  if (changed) emit()
}

function watchTranscripts(): void {
  for (const provider of providerRegistry) {
    if (!adapterFor(provider.id)) continue
    for (const relative of provider.activityPaths ?? []) {
      const dir = join(homedir(), relative)
      if (!existsSync(dir)) continue
      try {
        const watcher = watch(dir, { recursive: true }, () => onActivity(provider.id))
        watcher.on('error', () => watcher.close())
        watchers.push(watcher)
      } catch {
        /* lose this trigger only */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Session state helpers used by control/guard
// ---------------------------------------------------------------------------

export function markStopping(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  s.state = 'stopping'
  emit()
}

export function forget(id: string): void {
  if (sessions.delete(id)) emit()
}

export function setPaused(next: PausedSession[]): void {
  paused = next
  emit()
}

export function getPaused(): PausedSession[] {
  return paused
}

export function startAgentMonitor(initialPaused: PausedSession[]): void {
  paused = initialPaused
  watchTranscripts()
  void scan()
  scanTimer = setInterval(() => void scan(), SCAN_INTERVAL_MS)
}

export function stopAgentMonitor(): void {
  if (scanTimer) clearInterval(scanTimer)
  for (const w of watchers.splice(0)) w.close()
}

/** Force a scan now (after a stop, so the list updates without waiting for the tick). */
export function rescanAgents(): Promise<void> {
  return scan()
}
