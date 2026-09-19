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
