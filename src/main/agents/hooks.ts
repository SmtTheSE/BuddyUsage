import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { HookStatus } from '@shared/types'
import { agentAdapters, adapterFor } from './adapters'

/**
 * Wires each CLI's own hook/notify mechanism to BuddyUsage's local
 * listener so the island can say "Claude is waiting for you" the moment
 * it happens. Installation edits the user's config files, so it is
 * opt-in from Settings, marked so it can be recognised and removed, and
 * never touches entries that belong to anything else.
 */

/** Every command we install contains this so status/uninstall can find it. */
const MARK = '/buddyusage/'

export interface HookTarget {
  port: number
  token: string
}

function endpoint(target: HookTarget, providerId: string): string {
  return `http://127.0.0.1:${target.port}${MARK}${providerId}/${target.token}`
}

/** curl ships with macOS, Linux and Windows 10+; stdin carries the JSON payload. */
function curlCommand(url: string): string {
  return `curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- ${url}`
}

const home = homedir()
const CLAUDE_SETTINGS = join(home, '.claude', 'settings.json')
const GEMINI_SETTINGS = join(home, '.gemini', 'settings.json')
const CODEX_CONFIG = join(home, '.codex', 'config.toml')

// Which events we listen to, per CLI. Claude and Gemini share a hooks
// schema: { Event: [{ matcher?, hooks: [{ type, command, timeout }] }] }.
const CLAUDE_EVENTS = ['Notification', 'Stop', 'UserPromptSubmit']
const GEMINI_EVENTS = ['Notification', 'AfterAgent', 'BeforeAgent']

type HooksMap = Record<string, Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string; name?: string; timeout?: number }> }>>

async function readJson(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {}
  const text = await readFile(path, 'utf8')
  return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {}
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function ours(entry: { hooks?: Array<{ command?: string }> }): boolean {
  return !!entry.hooks?.some((h) => h.command?.includes(MARK))
}

function hooksStatusInJson(settings: Record<string, unknown>, events: string[]): 'installed' | 'not_installed' {
  const hooks = (settings.hooks ?? {}) as HooksMap
  return events.every((ev) => (hooks[ev] ?? []).some(ours)) ? 'installed' : 'not_installed'
}

// Claude Code's hook entries are { type, command, timeout(seconds) } and
// its settings are schema-checked, so no extra keys; Gemini's carry a
// name and a timeout in milliseconds.
type HookFlavour = 'claude' | 'gemini'

async function installJsonHooks(path: string, events: string[], url: string, flavour: HookFlavour): Promise<void> {
  const settings = await readJson(path)
  const hooks = ((settings.hooks ?? {}) as HooksMap) || {}
  const entry =
    flavour === 'claude'
      ? { type: 'command', command: curlCommand(url), timeout: 5 }
      : { name: 'buddyusage', type: 'command', command: curlCommand(url), timeout: 5000 }
  for (const ev of events) {
    const list = (hooks[ev] ?? []).filter((e) => !ours(e))
    list.push({ matcher: '*', hooks: [entry] })
    hooks[ev] = list
  }
  settings.hooks = hooks
  await writeJson(path, settings)
}

async function uninstallJsonHooks(path: string): Promise<void> {
  const settings = await readJson(path)
  const hooks = settings.hooks as HooksMap | undefined
  if (!hooks) return
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = (hooks[ev] ?? []).filter((e) => !ours(e))
    if (hooks[ev].length === 0) delete hooks[ev]
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks
  else settings.hooks = hooks
  await writeJson(path, settings)
}

// Codex has a single `notify` program (argv gets the JSON as its last
// argument, which is exactly what `curl --data-binary` wants).
function codexNotifyLine(url: string): string {
  return `notify = ["curl", "-s", "-m", "3", "-X", "POST", "-H", "Content-Type: application/json", "${url}", "--data-binary"]`
}

async function codexStatus(): Promise<HookStatus> {
  if (!existsSync(CODEX_CONFIG)) return { providerId: 'chatgpt', status: 'not_installed' }
  const text = await readFile(CODEX_CONFIG, 'utf8')
  const line = text.split('\n').find((l) => /^\s*notify\s*=/.test(l))
  if (!line) return { providerId: 'chatgpt', status: 'not_installed' }
  if (line.includes(MARK)) return { providerId: 'chatgpt', status: 'installed', detail: CODEX_CONFIG }
  return {
    providerId: 'chatgpt',
    status: 'conflict',
    detail: `Codex allows one notify program and yours is already set in ${CODEX_CONFIG}. Installing replaces it (the old line is kept as a comment).`
  }
}

async function installCodex(url: string): Promise<void> {
  const text = existsSync(CODEX_CONFIG) ? await readFile(CODEX_CONFIG, 'utf8') : ''
  const lines = text.split('\n')
  const idx = lines.findIndex((l) => /^\s*notify\s*=/.test(l))
  const ourLine = codexNotifyLine(url)
  if (idx === -1) {
    // Top-level keys must precede any [table]; insert before the first one.
    const firstTable = lines.findIndex((l) => /^\s*\[/.test(l))
    if (firstTable === -1) lines.push(ourLine)
    else lines.splice(firstTable, 0, ourLine, '')
  } else if (lines[idx].includes(MARK)) {
    lines[idx] = ourLine
  } else {
    lines.splice(idx, 1, `# buddyusage-replaced: ${lines[idx]}`, ourLine)
  }
  await mkdir(dirname(CODEX_CONFIG), { recursive: true })
  await writeFile(CODEX_CONFIG, lines.join('\n'), 'utf8')
}

async function uninstallCodex(): Promise<void> {
  if (!existsSync(CODEX_CONFIG)) return
  const lines = (await readFile(CODEX_CONFIG, 'utf8')).split('\n')
  const idx = lines.findIndex((l) => /^\s*notify\s*=/.test(l) && l.includes(MARK))
  if (idx === -1) return
  lines.splice(idx, 1)
  const backup = lines.findIndex((l) => l.startsWith('# buddyusage-replaced: '))
  if (backup !== -1) lines[backup] = lines[backup].replace('# buddyusage-replaced: ', '')
  await writeFile(CODEX_CONFIG, lines.join('\n'), 'utf8')
}

export async function hookStatus(providerId: string): Promise<HookStatus> {
  const adapter = adapterFor(providerId)
  if (!adapter) return { providerId, status: 'unsupported', detail: 'No local CLI.' }
  try {
    switch (adapter.hooks) {
      case 'claude-settings':
        return { providerId, status: hooksStatusInJson(await readJson(CLAUDE_SETTINGS), CLAUDE_EVENTS), detail: CLAUDE_SETTINGS }
      case 'gemini-settings':
        return { providerId, status: hooksStatusInJson(await readJson(GEMINI_SETTINGS), GEMINI_EVENTS), detail: GEMINI_SETTINGS }
      case 'codex-notify':
        return await codexStatus()
    }
  } catch (error) {
    return { providerId, status: 'conflict', detail: `Could not read config: ${(error as Error).message}` }
  }
}

export async function allHookStatuses(): Promise<HookStatus[]> {
  return Promise.all(agentAdapters.map((a) => hookStatus(a.providerId)))
}

export async function installHooks(providerId: string, target: HookTarget): Promise<HookStatus> {
  const adapter = adapterFor(providerId)
  if (!adapter) return { providerId, status: 'unsupported' }
  const url = endpoint(target, providerId)
  switch (adapter.hooks) {
    case 'claude-settings':
      await installJsonHooks(CLAUDE_SETTINGS, CLAUDE_EVENTS, url, 'claude')
      break
    case 'gemini-settings':
      await installJsonHooks(GEMINI_SETTINGS, GEMINI_EVENTS, url, 'gemini')
      break
    case 'codex-notify':
      await installCodex(url)
      break
  }
  return hookStatus(providerId)
}

export async function uninstallHooks(providerId: string): Promise<HookStatus> {
  const adapter = adapterFor(providerId)
  if (!adapter) return { providerId, status: 'unsupported' }
  switch (adapter.hooks) {
    case 'claude-settings':
      await uninstallJsonHooks(CLAUDE_SETTINGS)
      break
    case 'gemini-settings':
      await uninstallJsonHooks(GEMINI_SETTINGS)
      break
    case 'codex-notify':
      await uninstallCodex()
      break
  }
  return hookStatus(providerId)
}

/**
 * The listener's port can change between launches (if the preferred one
 * was taken). Anything we installed earlier is re-pointed silently so the
 * user never has to reinstall.
 */
export async function repointInstalledHooks(target: HookTarget): Promise<void> {
  for (const adapter of agentAdapters) {
    const status = await hookStatus(adapter.providerId)
    if (status.status !== 'installed') continue
    const wanted = endpoint(target, adapter.providerId)
    const detail = status.detail ?? ''
    const path = adapter.hooks === 'codex-notify' ? CODEX_CONFIG : detail
    try {
      const text = await readFile(path, 'utf8')
      if (text.includes(wanted)) continue
      await installHooks(adapter.providerId, target)
    } catch {
      /* leave as is */
    }
  }
}
