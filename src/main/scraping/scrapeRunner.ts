import type { BrowserWindow } from 'electron'
import type { ProviderDefinition } from '../providers/types'
import type { UsageSnapshot } from '@shared/types'
import { getProviderWindow } from './windowPool'
import { getSnapshot, setSnapshot } from '../store/usageStore'
import {
  findPlanLabel,
  findResetPhrase,
  looksFreeTier,
  looksSignedOut,
  type ParsedUsage
} from '../providers/parseHeuristics'
import { parseResetLabel } from './resetTime'

const PAGE_SETTLE_MS = 2000 // lets client-rendered SPA content paint before we read the DOM
// Usage pages are SPAs that paint their labels before their numbers. A
// single read can land mid-hydration and see "5 hour usage limit" with no
// figure yet, so we keep re-reading until every expected window has a
// value and two consecutive reads agree — then the numbers are real.
const READ_POLL_MS = 750
const READ_TIMEOUT_MS = 15_000
const LOGIN_POLL_MS = 1500
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
// A provider's page can hang indefinitely (slow bot-challenge, dropped
// connection, an SPA that never fires 'did-finish-load'). Without a hard
// ceiling here, that provider would sit in "loading" forever and never
// surface a retry — observed live against a real provider during development.
const SCRAPE_TIMEOUT_MS = 40_000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function navigateAndSettle(win: BrowserWindow, url: string): Promise<void> {
  await win.webContents.loadURL(url).catch(() => undefined)
  await wait(PAGE_SETTLE_MS)
}

/**
 * Only a labelled meter counts as a reading. The generic fallback (a bare
 * number somewhere on the page) is fine for the CLI's best-effort output,
 * but on the gauge a wrong number is worse than a "stale" badge — so the
 * app requires the provider's declared windows, and the primary one in
 * particular.
 */
function isTrustworthy(provider: ProviderDefinition, parsed: ParsedUsage | undefined): parsed is ParsedUsage {
  if (!parsed || parsed.metrics.length === 0) return false
  if (parsed.complete) return true
  const primaryId = provider.metrics[0]?.id
  if (!primaryId) return parsed.metrics[0].id !== 'usage'
  return parsed.metrics.some((m) => m.id === primaryId)
}

function isComplete(provider: ProviderDefinition, parsed: ParsedUsage): boolean {
  if (parsed.complete) return true
  const ids = new Set(parsed.metrics.map((m) => m.id))
  return provider.metrics.every((spec) => ids.has(spec.id))
}

function sameReading(a: ParsedUsage | undefined, b: ParsedUsage | undefined): boolean {
  if (!a || !b) return false
  return JSON.stringify(a.metrics) === JSON.stringify(b.metrics)
}

/**
 * Re-reads the page until it is fully rendered: every declared window has a
 * figure and two consecutive reads agree. If the page never completes
 * (a plan that hides one window, say), a stable reading that includes the
 * primary window is accepted at the deadline; anything less is reported as
 * unreadable so the previous good numbers stay on screen instead of a
 * guess.
 */
async function readUntilStable(
  provider: ProviderDefinition,
  win: BrowserWindow
): Promise<{ raw: string; parsed: ParsedUsage | undefined }> {
  const deadline = Date.now() + READ_TIMEOUT_MS
  let raw = ''
  let last: ParsedUsage | undefined
  let stable: { raw: string; parsed: ParsedUsage } | undefined

  for (;;) {
    raw = await provider.extractRaw(win.webContents)
    const parsed = provider.parse(raw)
    const trusted = isTrustworthy(provider, parsed) ? parsed : undefined

    // A structured (API) reading is exact on the first try; there is no
    // hydration to wait out.
    if (trusted?.complete) return { raw, parsed: trusted }

    if (trusted && sameReading(trusted, last)) {
      stable = { raw, parsed: trusted }
      if (isComplete(provider, trusted)) return stable
    }
    last = trusted

    if (Date.now() >= deadline) return stable ?? { raw, parsed: undefined }
    await wait(READ_POLL_MS)
  }
}

/** A failed refresh keeps the last good reading visible instead of blanking the gauge. */
function carryOverGoodFields(previous?: UsageSnapshot): Pick<UsageSnapshot, 'planLabel' | 'metrics'> {
  if (previous?.status !== 'ok') return { metrics: [] }
  return { planLabel: previous.planLabel, metrics: previous.metrics }
}

async function performScrape(
  provider: ProviderDefinition,
  win: BrowserWindow,
  previous: UsageSnapshot | undefined,
  nowIso: string
): Promise<UsageSnapshot> {
  await navigateAndSettle(win, provider.usageUrl)

  const loggedIn = await provider.isLoggedIn(win.webContents)
  if (!loggedIn) {
    return { providerId: provider.id, status: 'logged_out', message: 'Sign in required', metrics: [], lastSyncedAt: nowIso }
  }

  const { raw, parsed } = await readUntilStable(provider, win)

  if (parsed) {
    const now = new Date()
    const metrics = parsed.metrics.map((m) => ({
      ...m,
      resetsAt: m.resetsAt ?? parseResetLabel(m.resetLabel, now)?.toISOString()
    }))
    const { complete: _complete, ...fields } = parsed
    return { providerId: provider.id, status: 'ok', raw: raw.slice(0, 800), lastSyncedAt: nowIso, ...fields, metrics }
  }

  // The URL-based isLoggedIn check above can miss providers that never
  // redirect a logged-out visitor to a distinct URL (e.g. ChatGPT's landing
  // page) — fall back to text-based auth-wall detection so this reports
  // "sign in required" instead of a generic parse error.
  if (previous?.status !== 'ok' && looksSignedOut(raw)) {
    return { providerId: provider.id, status: 'logged_out', message: 'Sign in required', metrics: [], lastSyncedAt: nowIso }
  }

  // Signed in, but the plan publishes no meter (Free on Claude/ChatGPT,
  // or a provider-specific "explainer only" panel): say so plainly, and
  // surface a reset time if the page mentions one.
  if (looksFreeTier(raw) || provider.noMeter?.(raw)) {
    const reset = findResetPhrase(raw)
    return {
      providerId: provider.id,
      status: 'no_meter',
      planLabel: findPlanLabel(raw) ?? 'Free',
      message: reset ? `${provider.freeTierNote} Limit resets ${reset}.` : provider.freeTierNote,
      metrics: [],
      raw: raw.slice(0, 800),
      lastSyncedAt: nowIso
    }
  }

  return {
    providerId: provider.id,
    status: previous?.status === 'ok' ? 'stale' : 'error',
    message: "Couldn't read usage from this page — it may have changed.",
    raw: raw.slice(0, 800),
    lastSyncedAt: nowIso,
    ...carryOverGoodFields(previous)
  }
}

export interface SyncState {
  providerId: string
  syncing: boolean
}

type SyncListener = (state: SyncState) => void
const syncListeners = new Set<SyncListener>()
const inFlight = new Map<string, Promise<UsageSnapshot>>()

/** The UI subscribes to show "Updating…" while a provider is being fetched. */
export function onSyncStateChanged(listener: SyncListener): () => void {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

export function isSyncing(providerId: string): boolean {
  return inFlight.has(providerId)
}

function emitSync(providerId: string, syncing: boolean): void {
  for (const listener of syncListeners) listener({ providerId, syncing })
}

/**
 * Runs one provider's full fetch → parse → persist cycle. Never throws and
 * never hangs past SCRAPE_TIMEOUT_MS: every outcome resolves to a
 * well-formed UsageSnapshot so one broken/slow provider can't take down the
 * scheduler, stall the UI, or block the next poll. Several triggers can
 * fire at once (poll, hover, activity, reset) — a provider already being
 * fetched just shares the in-flight result instead of hitting the site again.
 */
export function runProviderScrape(provider: ProviderDefinition): Promise<UsageSnapshot> {
  const existing = inFlight.get(provider.id)
  if (existing) return existing

  emitSync(provider.id, true)
  const run = scrapeOnce(provider).finally(() => {
    inFlight.delete(provider.id)
    emitSync(provider.id, false)
  })
  inFlight.set(provider.id, run)
  return run
}

async function scrapeOnce(provider: ProviderDefinition): Promise<UsageSnapshot> {
  const nowIso = new Date().toISOString()
  const previous = getSnapshot(provider.id)
  const win = getProviderWindow(provider)

  let timeoutHandle: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.stop()
      reject(new Error(`Timed out waiting for ${provider.name}'s usage page to respond.`))
    }, SCRAPE_TIMEOUT_MS)
  })

  let snapshot: UsageSnapshot
  try {
    snapshot = await Promise.race([performScrape(provider, win, previous, nowIso), timeout])
  } catch (error) {
    snapshot = {
      providerId: provider.id,
      status: previous?.status === 'ok' ? 'stale' : 'error',
      message: error instanceof Error ? error.message : 'Unknown error while fetching usage.',
      lastSyncedAt: nowIso,
      ...carryOverGoodFields(previous)
    }
  } finally {
    clearTimeout(timeoutHandle!)
  }

  setSnapshot(snapshot)
  return snapshot
}

/**
 * Shows the provider's hidden window so the user can sign in, then polls
 * until `isLoggedIn` succeeds (or times out) before hiding it again and
 * kicking off an immediate scrape.
 */
export async function requestProviderLogin(provider: ProviderDefinition): Promise<boolean> {
  const win = getProviderWindow(provider)
  win.show()
  win.focus()
  await navigateAndSettle(win, provider.loginUrl ?? provider.usageUrl)

  // Closing the window hides it (see windowPool) — treat that as "cancel".
  const cancelled = (): boolean => win.isDestroyed() || !win.isVisible()

  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  let loggedIn = false
  while (!cancelled() && Date.now() < deadline) {
    loggedIn = await provider.isLoggedIn(win.webContents)
    if (loggedIn) break
    await wait(LOGIN_POLL_MS)
  }

  if (!win.isDestroyed()) win.hide()
  if (loggedIn) await runProviderScrape(provider)
  return loggedIn
}
