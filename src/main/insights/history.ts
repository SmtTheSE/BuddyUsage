import Store from 'electron-store'
import type { UsageForecast, UsageSnapshot } from '@shared/types'

/**
 * A short rolling history of every gauge, so the app can answer the
 * question a percentage alone can't: *am I going to make it to the reset?*
 *
 * Samples come free — the scheduler already polls every few minutes. Two
 * days of them is a few hundred rows, kept in the same store style as the
 * rest of the app.
 */

const KEEP_MS = 48 * 60 * 60 * 1000
/** Ignore samples older than this when measuring the current pace. */
const WINDOW_MS = 2 * 60 * 60 * 1000
/** Below this, a "pace" is noise rather than a trend. */
const MIN_SAMPLES = 3
const MIN_SPAN_MS = 10 * 60 * 1000
/** A drop this large means the limit window rolled over, not that usage fell. */
const RESET_DROP = 5

interface Sample {
  at: number
  percent: number
}

interface HistoryShape {
  version: number
  samples: Record<string, Sample[]>
}

const store = new Store<HistoryShape>({
  projectName: 'BuddyUsage',
  name: 'buddy-usage-history',
  defaults: { version: 1, samples: {} }
} as ConstructorParameters<typeof Store<HistoryShape>>[0])

function key(providerId: string, metricId: string): string {
  return `${providerId}:${metricId}`
}

export function recordSnapshot(snapshot: UsageSnapshot): void {
  if (snapshot.status !== 'ok' || snapshot.metrics.length === 0) return
  const samples = store.get('samples')
  const now = snapshot.lastSyncedAt ? new Date(snapshot.lastSyncedAt).getTime() : Date.now()
  const cutoff = now - KEEP_MS
  let changed = false

  for (const metric of snapshot.metrics) {
    const id = key(snapshot.providerId, metric.id)
    const list = (samples[id] ?? []).filter((s) => s.at >= cutoff)
    const last = list[list.length - 1]
    // Only store movement (or a heartbeat every 30 min) — a flat gauge
    // polled every 3 minutes would otherwise fill the file with copies.
    if (!last || last.percent !== metric.percentUsed || now - last.at > 30 * 60 * 1000) {
      list.push({ at: now, percent: metric.percentUsed })
      changed = true
    }
    samples[id] = list
  }
  if (changed) store.set('samples', samples)
}

/** Samples since the last window rollover, so a reset never looks like negative usage. */
function currentRun(list: Sample[], now: number): Sample[] {
  const recent = list.filter((s) => s.at >= now - WINDOW_MS)
  let start = 0
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].percent - recent[i].percent >= RESET_DROP) start = i
  }
  return recent.slice(start)
}

/**
 * Pace and what it implies, or `undefined` when there isn't enough signal.
 * Deliberately conservative: better no forecast than a confident wrong one.
 */
export function forecast(providerId: string, metricId: string, percentNow: number, resetsAt?: string): UsageForecast | undefined {
  const list = store.get('samples')[key(providerId, metricId)] ?? []
  const now = Date.now()
  const run = currentRun(list, now)
  if (run.length < MIN_SAMPLES) return undefined
  const first = run[0]
  const last = run[run.length - 1]
  const spanMs = last.at - first.at
  if (spanMs < MIN_SPAN_MS) return undefined

  const ratePerHour = ((last.percent - first.percent) / spanMs) * 3_600_000
  const result: UsageForecast = { ratePerHour: Math.round(ratePerHour * 10) / 10 }

  if (ratePerHour > 0.5) {
    const hoursToFull = (100 - percentNow) / ratePerHour
    if (hoursToFull > 0 && hoursToFull < 72) result.emptyAt = new Date(now + hoursToFull * 3_600_000).toISOString()
  }

  if (resetsAt) {
    const msToReset = new Date(resetsAt).getTime() - now
    if (msToReset > 0) {
      const projected = percentNow + (ratePerHour * msToReset) / 3_600_000
      result.projectedAtReset = Math.max(0, Math.min(150, Math.round(projected)))
      // A pace that would exhaust the window before it rolls over is the
      // one thing worth flagging.
      result.willRunOut = projected >= 100
    }
  }
  return result
}

/** Everything known about a provider's primary metric, for the card. */
export function forecastFor(snapshot: UsageSnapshot | undefined): UsageForecast | undefined {
  const metric = snapshot?.metrics?.[0]
  if (!snapshot || !metric) return undefined
  return forecast(snapshot.providerId, metric.id, metric.percentUsed, metric.resetsAt)
}
