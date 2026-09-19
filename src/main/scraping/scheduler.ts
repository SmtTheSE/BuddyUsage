import { watch, type FSWatcher } from 'fs'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { powerMonitor } from 'electron'
import { providerRegistry, getProvider } from '../providers/registry'
import type { ProviderDefinition } from '../providers/types'
import { getSettings } from '../store/settings'
import { onSnapshotUpdated } from '../store/usageStore'
import { runProviderScrape } from './scrapeRunner'
import { parseResetLabel } from './resetTime'
import type { UsageSnapshot } from '@shared/types'

/**
 * Keeps every gauge current without the user asking. Four triggers feed the
 * same deduplicated scrape:
 *   1. a base poll per provider (staggered so sites aren't hit together),
 *   2. local CLI activity — the provider's session directory changing means
 *      the user is using that tool right now, so re-sync shortly after,
 *   3. the provider's own reset time, so a window rolling over shows 0%
 *      on its own instead of a stale "73%" until the next poll,
 *   4. waking from sleep, when everything on screen is guaranteed stale.
 * (A fifth — opening a popover on stale data — lives in the renderer.)
 */

// Activity is throttled, not debounced: a CLI streaming to disk for minutes
// still gets its first re-sync promptly and then one per gap, rather than
// never (debounce) or continuously (per event).
const ACTIVITY_LEAD_MS = 15_000
const ACTIVITY_MIN_GAP_MS = 60_000
const RESUME_DELAY_MS = 5_000
const RESET_GRACE_MS = 45_000 // let the provider roll the window over before reading it
const MAX_RESET_TIMER_MS = 24 * 60 * 60 * 1000

const pollTimers = new Map<string, NodeJS.Timeout>()
const staggerTimers = new Map<string, NodeJS.Timeout>()
const activityTimers = new Map<string, NodeJS.Timeout>()
const resetTimers = new Map<string, NodeJS.Timeout>()
const watchers: FSWatcher[] = []
let listenersInstalled = false

function clearMap(map: Map<string, NodeJS.Timeout>, clear: (t: NodeJS.Timeout) => void): void {
  for (const t of map.values()) clear(t)
  map.clear()
}

function enabledProviders(): ProviderDefinition[] {
  const settings = getSettings()
  return providerRegistry.filter((p) => settings.enabledProviders[p.id] !== false)
}

const lastActivityRefresh = new Map<string, number>()

function scheduleActivityRefresh(provider: ProviderDefinition): void {
  if (activityTimers.has(provider.id)) return
  const sinceLast = Date.now() - (lastActivityRefresh.get(provider.id) ?? 0)
  const delay = Math.max(ACTIVITY_LEAD_MS, ACTIVITY_MIN_GAP_MS - sinceLast)
  activityTimers.set(
    provider.id,
    setTimeout(() => {
      activityTimers.delete(provider.id)
      lastActivityRefresh.set(provider.id, Date.now())
      void runProviderScrape(provider)
    }, delay)
  )
}

function watchActivity(providers: ProviderDefinition[]): void {
  for (const provider of providers) {
    for (const relative of provider.activityPaths ?? []) {
      const dir = join(homedir(), relative)
      if (!existsSync(dir)) continue
      try {
        // Recursive watching is supported on macOS and Windows, and on
        // Linux from Node 20 — all of which Electron 33 covers.
        const watcher = watch(dir, { recursive: true }, () => scheduleActivityRefresh(provider))
        watcher.on('error', () => watcher.close())
        watchers.push(watcher)
      } catch {
        // A directory that can't be watched just loses this trigger.
      }
    }
  }
}

function scheduleResetRefresh(snapshot: UsageSnapshot): void {
  const provider = getProvider(snapshot.providerId)
  if (!provider) return
  const pending = resetTimers.get(provider.id)
  if (pending) clearTimeout(pending)

  const now = new Date()
  const next = snapshot.metrics
    .map((m) => parseResetLabel(m.resetLabel, now))
    .filter((d): d is Date => !!d && d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0]
  if (!next) return

  const delay = Math.min(next.getTime() - now.getTime() + RESET_GRACE_MS, MAX_RESET_TIMER_MS)
  resetTimers.set(
    provider.id,
    setTimeout(() => {
      resetTimers.delete(provider.id)
      void runProviderScrape(provider)
    }, delay)
  )
}

function installOnce(): void {
  if (listenersInstalled) return
  listenersInstalled = true
  onSnapshotUpdated(scheduleResetRefresh)
  powerMonitor.on('resume', () => {
    setTimeout(() => void refreshProviderNow(), RESUME_DELAY_MS)
  })
}

export function startScrapeScheduler(): void {
  stopScrapeScheduler()
  installOnce()

  const intervalMs = getSettings().refreshIntervalMinutes * 60 * 1000
  const providers = enabledProviders()

  providers.forEach((provider, index) => {
    const staggerMs = index * 4000
    staggerTimers.set(
      provider.id,
      setTimeout(() => {
        void runProviderScrape(provider)
        pollTimers.set(provider.id, setInterval(() => void runProviderScrape(provider), intervalMs))
      }, staggerMs)
    )
  })

  watchActivity(providers)
}

export function stopScrapeScheduler(): void {
  clearMap(pollTimers, clearInterval)
  clearMap(staggerTimers, clearTimeout)
  clearMap(activityTimers, clearTimeout)
  clearMap(resetTimers, clearTimeout)
  for (const watcher of watchers.splice(0)) watcher.close()
}

export function restartScrapeScheduler(): void {
  startScrapeScheduler()
}

export async function refreshProviderNow(providerId?: string): Promise<void> {
  if (providerId) {
    const provider = getProvider(providerId)
    if (provider) await runProviderScrape(provider)
    return
  }
  await Promise.all(enabledProviders().map((p) => runProviderScrape(p)))
}
