import { Notification } from 'electron'
import Store from 'electron-store'
import type { UsageSnapshot } from '@shared/types'
import { getSettings } from '../store/settings'
import { getProvider } from '../providers/registry'
import { activityReport } from './activity'

/**
 * When a weekly window rolls over, say what the week actually cost: how
 * much of the plan went, and which project took most of it. It is the one
 * moment the number is both final and interesting.
 */

const RESET_DROP = 20
/** Never more than one digest per provider per day, whatever the page does. */
const MIN_GAP_MS = 20 * 60 * 60 * 1000

const store = new Store<{ lastDigestAt: Record<string, number>; peak: Record<string, number> }>({
  projectName: 'BuddyUsage',
  name: 'buddy-usage-digest',
  defaults: { lastDigestAt: {}, peak: {} }
} as ConstructorParameters<typeof Store<{ lastDigestAt: Record<string, number>; peak: Record<string, number> }>>[0])

function weeklyMetric(snapshot: UsageSnapshot): { label: string; percentUsed: number } | undefined {
  return snapshot.metrics.find((m) => /week/i.test(m.label))
}

export function handleSnapshotForDigest(snapshot: UsageSnapshot): void {
  if (!getSettings().weeklyDigest) return
  if (snapshot.status !== 'ok') return
  const metric = weeklyMetric(snapshot)
  if (!metric) return

  const peaks = store.get('peak')
  const previous = peaks[snapshot.providerId] ?? 0
  // Track the high-water mark so the digest can report what the week
  // reached, not the 0% that follows the reset.
  if (metric.percentUsed >= previous) {
    peaks[snapshot.providerId] = metric.percentUsed
    store.set('peak', peaks)
    return
  }
  if (previous - metric.percentUsed < RESET_DROP) return

  const lastAt = store.get('lastDigestAt')
  if (Date.now() - (lastAt[snapshot.providerId] ?? 0) < MIN_GAP_MS) {
    peaks[snapshot.providerId] = metric.percentUsed
    store.set('peak', peaks)
    return
  }

  const name = getProvider(snapshot.providerId)?.name ?? snapshot.providerId
  const report = activityReport(7)
  const top = report.byProject[0]
  const body = [
    `You used ${previous}% of the weekly limit.`,
    top ? `Heaviest project: ${top.label} (${top.share}%).` : undefined,
    'A fresh window starts now.'
  ]
    .filter(Boolean)
    .join(' ')

  if (Notification.isSupported()) new Notification({ title: `${name}: your week in review`, body }).show()
  lastAt[snapshot.providerId] = Date.now()
  peaks[snapshot.providerId] = metric.percentUsed
  store.set('lastDigestAt', lastAt)
  store.set('peak', peaks)
}
