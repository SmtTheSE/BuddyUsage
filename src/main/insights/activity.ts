import { createReadStream } from 'fs'
import { readdir, stat } from 'fs/promises'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { basename, join } from 'path'
import Store from 'electron-store'
import type { ActivityReport, ActivityRow, ProviderId } from '@shared/types'
import {
  EMPTY_TOKENS,
  addTokens,
  mayHoldUsage,
  parseClaudeLine,
  parseCodexLine,
  parseCodexMeta,
  prettyModel,
  tokenDelta,
  type TokenCounts,
  type UsageEvent
} from './logParsers'

/**
 * "Where did my week go": token usage per project, per model and per day,
 * read from the transcripts the CLIs already write on this machine. No
 * network, no account, nothing leaves the computer — and no provider shows
 * this breakdown at all.
 *
 * The transcripts are large (hundreds of MB), so scanning is incremental:
 * each file is streamed once from the offset last seen, aggregates are
 * persisted per day, and only the tail of a growing file is re-read.
 */

const CACHE_VERSION = 3
const KEEP_DAYS = 35
const home = homedir()

/** day → provider → project path → model → tokens */
type DayIndex = Record<string, Record<string, Record<string, Record<string, TokenCounts>>>>

interface FileState {
  /** Bytes already folded into the totals. */
  offset: number
  /** Cumulative counters (Codex) at that offset, so a resumed scan keeps producing deltas. */
  cumulative?: TokenCounts
  cwd?: string
  model?: string
}

interface CacheShape {
  version: number
  days: DayIndex
  files: Record<string, FileState>
}

const store = new Store<CacheShape>({
  projectName: 'BuddyUsage',
  name: 'buddy-usage-activity',
  // `projectName` is only read when running outside Electron (unit tests);
  // in the app the path comes from app.getPath('userData'). It is not in
  // electron-store's published types, hence the cast below.
  defaults: { version: CACHE_VERSION, days: {}, files: {} }
} as ConstructorParameters<typeof Store<CacheShape>>[0])

if (store.get('version') !== CACHE_VERSION) {
  store.set({ version: CACHE_VERSION, days: {}, files: {} })
}

let scanning = false
let lastScanAt = 0
type Listener = () => void
const listeners = new Set<Listener>()

export function onActivityChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function dayKey(iso: string): string {
  // Local day, so "today" matches the user's clock rather than UTC.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function record(days: DayIndex, event: UsageEvent, cwd: string | undefined, model: string | undefined): void {
  const day = dayKey(event.at)
  if (day === 'unknown') return
  const provider = (days[day] ??= {})[event.providerId] ?? ((days[day][event.providerId] = {}) as Record<string, Record<string, TokenCounts>>)
  const project = (provider[cwd ?? 'unknown'] ??= {})
  const key = model ?? 'unknown'
  project[key] = addTokens(project[key] ?? EMPTY_TOKENS, event.tokens)
}

async function scanFile(path: string, providerId: ProviderId, state: FileState, days: DayIndex): Promise<FileState> {
  const info = await stat(path)
  // Truncated or replaced (log rotation): start over rather than mis-count.
  const start = info.size < state.offset ? 0 : state.offset
  if (info.size === start) return state
  const next: FileState = { ...state, offset: info.size }
  if (start === 0) next.cumulative = undefined

  const stream = createReadStream(path, { start, encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  let cwd = state.cwd
  let model = state.model
  let cumulative = state.cumulative

  try {
    for await (const line of lines) {
      if (!line) continue
      if (providerId === 'chatgpt') {
        if (!cwd && line.includes('"session_meta"')) {
          const meta = parseCodexMeta(line)
          if (meta) {
            if (meta.subagent) break // sub-agent rollout: its tokens belong to the parent session
            cwd = meta.cwd ?? cwd
            model = meta.model ?? model
          }
          continue
        }
        if (!mayHoldUsage(providerId, line)) continue
        const event = parseCodexLine(line)
        if (!event) continue
        const delta = tokenDelta(event.tokens, cumulative)
        cumulative = event.tokens
        if (delta.total > 0) record(days, { ...event, tokens: delta }, cwd, model)
        continue
      }
      if (!mayHoldUsage(providerId, line)) continue
      const event = parseClaudeLine(line)
      if (!event) continue
      cwd = event.cwd ?? cwd
      record(days, event, event.cwd ?? cwd, event.model)
    }
  } finally {
    lines.close()
    stream.destroy()
  }

  next.cwd = cwd
  next.model = model
  next.cumulative = cumulative
  return next
}

async function transcriptFiles(): Promise<{ path: string; providerId: ProviderId }[]> {
  const out: { path: string; providerId: ProviderId }[] = []
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000

  const claudeRoot = join(home, '.claude', 'projects')
  for (const dir of await readdir(claudeRoot).catch(() => [])) {
    for (const name of await readdir(join(claudeRoot, dir)).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(claudeRoot, dir, name)
      const info = await stat(path).catch(() => undefined)
      if (info?.isFile() && info.mtimeMs >= cutoff) out.push({ path, providerId: 'claude' })
    }
  }

  const codexRoot = join(home, '.codex', 'sessions')
  for (let back = 0; back < KEEP_DAYS; back++) {
    const d = new Date(Date.now() - back * 86_400_000)
    const dir = join(codexRoot, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
    for (const name of await readdir(dir).catch(() => [])) {
      if (name.endsWith('.jsonl')) out.push({ path: join(dir, name), providerId: 'chatgpt' })
    }
  }
  return out
}

function pruneOldDays(days: DayIndex): void {
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString())
  for (const day of Object.keys(days)) if (day < cutoff) delete days[day]
}

/**
 * Folds every new transcript line into the day index. Streams, so the main
 * process stays responsive even on the first run over a gigabyte of logs.
 */
export async function scanActivity(): Promise<void> {
  if (scanning) return
  scanning = true
  notify()
  try {
    const days = store.get('days')
    const files = store.get('files')
    const seen = new Set<string>()
    let touched = 0

    for (const { path, providerId } of await transcriptFiles()) {
      seen.add(path)
      const state = files[path] ?? { offset: 0 }
      try {
        const next = await scanFile(path, providerId, state, days)
        if (next.offset !== state.offset) touched++
        files[path] = next
      } catch {
        // Unreadable file: skip it, keep the rest.
      }
    }

    for (const path of Object.keys(files)) if (!seen.has(path)) delete files[path]
    pruneOldDays(days)
    if (touched > 0 || Object.keys(files).length > 0) store.set({ version: CACHE_VERSION, days, files })
    lastScanAt = Date.now()
  } finally {
    scanning = false
    notify()
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

function rowsFrom(map: Map<string, { tokens: TokenCounts; providerIds: Set<string> }>, total: number): ActivityRow[] {
  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      tokens: value.tokens.total,
      share: total > 0 ? Math.round((value.tokens.total / total) * 100) : 0,
      providerIds: [...value.providerIds]
    }))
    .sort((a, b) => b.tokens - a.tokens)
}

function bump(
  map: Map<string, { tokens: TokenCounts; providerIds: Set<string> }>,
  key: string,
  tokens: TokenCounts,
  providerId: string
): void {
  const entry = map.get(key) ?? { tokens: EMPTY_TOKENS, providerIds: new Set<string>() }
  entry.tokens = addTokens(entry.tokens, tokens)
  entry.providerIds.add(providerId)
  map.set(key, entry)
}

/** Rolls the day index up into what the Activity view shows. */
export function activityReport(rangeDays: number): ActivityReport {
  const days = store.get('days')
  const from = dayKey(new Date(Date.now() - (rangeDays - 1) * 86_400_000).toISOString())

  const byProject = new Map<string, { tokens: TokenCounts; providerIds: Set<string> }>()
  const byModel = new Map<string, { tokens: TokenCounts; providerIds: Set<string> }>()
  const byProvider = new Map<string, { tokens: TokenCounts; providerIds: Set<string> }>()
  const perDay = new Map<string, TokenCounts>()
  let totals = EMPTY_TOKENS

  for (const [day, providers] of Object.entries(days)) {
    if (day < from) continue
    for (const [providerId, projects] of Object.entries(providers)) {
      for (const [projectPath, models] of Object.entries(projects)) {
        for (const [model, tokens] of Object.entries(models)) {
          totals = addTokens(totals, tokens)
          perDay.set(day, addTokens(perDay.get(day) ?? EMPTY_TOKENS, tokens))
          bump(byProvider, providerId, tokens, providerId)
          bump(byProject, projectPath === 'unknown' ? 'Unknown project' : basename(projectPath), tokens, providerId)
          bump(byModel, prettyModel(model === 'unknown' ? undefined : model), tokens, providerId)
        }
      }
    }
  }

  const byDay: { date: string; tokens: number }[] = []
  for (let back = rangeDays - 1; back >= 0; back--) {
    const date = dayKey(new Date(Date.now() - back * 86_400_000).toISOString())
    byDay.push({ date, tokens: perDay.get(date)?.total ?? 0 })
  }

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    scanning,
    lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : undefined,
    totalTokens: totals.total,
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    cacheWriteTokens: totals.cacheWrite,
    turns: totals.turns,
    byProvider: rowsFrom(byProvider, totals.total),
    byProject: rowsFrom(byProject, totals.total).slice(0, 12),
    byModel: rowsFrom(byModel, totals.total).slice(0, 8),
    byDay
  }
}

export function isScanning(): boolean {
  return scanning
}
