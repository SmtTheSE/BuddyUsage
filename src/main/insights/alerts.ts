import { Notification } from 'electron'
import type { UsageSnapshot } from '@shared/types'
import { primaryMetric } from '@shared/types'
import { getSettings } from '../store/settings'
import { getProvider } from '../providers/registry'
import { forecastFor } from './history'

/**
 * The gauge is for glancing at; these are for when you are not looking.
 * One notification per threshold per limit window, cleared when the window
 * resets — never a stream of them.
 */

const RESET_DROP = 20
/** Fired thresholds per provider, reset when the window rolls over. */
const fired = new Map<string, Set<number>>()
const lastPercent = new Map<string, number>()

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

export function handleSnapshotForAlerts(snapshot: UsageSnapshot): void {
  const settings = getSettings()
  const metric = primaryMetric(snapshot)
  if (!metric || (snapshot.status !== 'ok' && snapshot.status !== 'stale')) return

  const providerId = snapshot.providerId
  const name = getProvider(providerId)?.name ?? providerId
  const previous = lastPercent.get(providerId)
  lastPercent.set(providerId, metric.percentUsed)

  // Window rolled over: clear the fired set and (optionally) say so.
  if (previous !== undefined && previous - metric.percentUsed >= RESET_DROP) {
    fired.delete(providerId)
    if (settings.alerts.enabled && settings.alerts.onReset && settings.alerts.providers[providerId] !== false) {
      notify(`${name} limit reset`, `Back to ${metric.percentUsed}% used. ${metric.label} is clear again.`)
    }
    return
  }

  if (!settings.alerts.enabled || settings.alerts.providers[providerId] === false) return

  const hit = fired.get(providerId) ?? new Set<number>()
  for (const threshold of [...settings.alerts.thresholds].sort((a, b) => a - b)) {
    if (metric.percentUsed < threshold || hit.has(threshold)) continue
    hit.add(threshold)
    const when = metric.resetLabel ? ` Resets ${metric.resetLabel}.` : ''
    notify(
      threshold >= 100 ? `${name} limit reached` : `${name} at ${metric.percentUsed}%`,
      threshold >= 100 ? `${metric.label} is used up.${when}` : `${metric.label} is ${metric.percentUsed}% used.${when}`
    )
  }
  fired.set(providerId, hit)

  // A pace that will exhaust the window before it resets is worth one
  // heads-up even well below the thresholds.
  if (settings.alerts.onPace && !hit.has(-1)) {
    const projection = forecastFor(snapshot)
    if (projection?.willRunOut && metric.percentUsed >= 40) {
      hit.add(-1)
      fired.set(providerId, hit)
      notify(
        `${name} is on pace to run out`,
        `${metric.percentUsed}% used and climbing about ${projection.ratePerHour}%/h. At this rate the window empties before it resets.`
      )
    }
  }
}
