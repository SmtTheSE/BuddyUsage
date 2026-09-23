import { USAGE_CRITICAL_PERCENT, USAGE_WARN_PERCENT, type UsageSnapshot } from '@shared/types'

export const USAGE_COLORS = {
  ok: '#34C759',
  warn: '#F2E53A',
  critical: '#FF4D1C',
  idle: '#5c5c60'
} as const

export function usageColor(percentUsed?: number): string {
  if (typeof percentUsed !== 'number') return USAGE_COLORS.idle
  if (percentUsed >= USAGE_CRITICAL_PERCENT) return USAGE_COLORS.critical
  if (percentUsed >= USAGE_WARN_PERCENT) return USAGE_COLORS.warn
  return USAGE_COLORS.ok
}

export function relativeSyncLabel(iso?: string): string {
  if (!iso) return 'Never synced'
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 15) return 'Synced just now'
  if (seconds < 60) return `Synced ${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `Synced ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `Synced ${hours}h ago`
}

export function hasReadings(snapshot?: UsageSnapshot): boolean {
  return !!snapshot && (snapshot.status === 'ok' || snapshot.status === 'stale') && snapshot.metrics.length > 0
}

/** "in 48 min" / "in 3h 12m" / "Tue 11:07 PM" from an absolute reset time; undefined once it has passed. */
/**
 * How far through the current limit window we are, as a percentage — the
 * "even burn" reference for the ring's pace tick. Needs the window length,
 * which is inferred from the metric's own wording ("5-hour limit",
 * "Weekly limit") plus how long is left until it resets.
 */
export function paceReference(metric?: { label?: string; resetsAt?: string }): number | undefined {
  if (!metric?.resetsAt) return undefined
  const msLeft = new Date(metric.resetsAt).getTime() - Date.now()
  if (!Number.isFinite(msLeft) || msLeft <= 0) return undefined
  const label = (metric.label ?? '').toLowerCase()
  const windowMs = /month/.test(label)
    ? 30 * 86_400_000
    : /week/.test(label)
      ? 7 * 86_400_000
      : /(\d+)\s*-?\s*hour/.exec(label)
        ? Number(/(\d+)\s*-?\s*hour/.exec(label)![1]) * 3_600_000
        : /session|current/.test(label)
          ? 5 * 3_600_000
          : undefined
  if (!windowMs || msLeft > windowMs) return undefined
  return Math.round(((windowMs - msLeft) / windowMs) * 100)
}

export function formatUntil(iso?: string, now = Date.now()): string | undefined {
  if (!iso) return undefined
  const ms = new Date(iso).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
