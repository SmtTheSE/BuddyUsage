/**
 * Types shared between the main process and the renderer.
 * The renderer never imports Electron/Node types directly — everything it
 * needs about providers and usage crosses this boundary as plain data.
 */

export type ProviderId = string

export type UsageStatus =
  | 'loading' // never fetched yet
  | 'ok' // parsed successfully
  | 'stale' // last fetch failed, showing a previous good snapshot
  | 'error' // fetch/parse failed and there is no previous snapshot
  | 'logged_out' // provider page requires sign-in

/**
 * One limit window on a provider's usage page, e.g. "Current session" or
 * "All models (weekly)". Providers expose several; the first is treated as
 * primary and drives the ring gauge.
 */
export interface UsageMetric {
  id: string
  label: string
  percentUsed: number
  used?: number
  limit?: number
  unit?: string
  /** Human-readable reset phrase exactly as the page shows it ("in 51 min", "Thu 12:00 AM"). */
  resetLabel?: string
}

export interface SyncState {
  providerId: ProviderId
  syncing: boolean
}

export interface UsageSnapshot {
  providerId: ProviderId
  status: UsageStatus
  planLabel?: string
  metrics: UsageMetric[]
  lastSyncedAt?: string // ISO timestamp
  message?: string // human-readable status/error detail shown in the UI
  raw?: string // last raw extracted text, for debugging
}

export interface ProviderMeta {
  id: ProviderId
  name: string
  color: string
  usageUrl: string
}

export type ScreenEdge = 'right' | 'left'
export type ThemeMode = 'auto' | 'light' | 'dark'

export interface AppSettings {
  schemaVersion: number
  refreshIntervalMinutes: number
  enabledProviders: Record<ProviderId, boolean>
  /** Which screen edge the island docks to. */
  edge: ScreenEdge
  /** Distance in points from the top of the usable screen area to the island's top. */
  verticalOffset: number
  /** Display the island lives on (Electron display id); falls back to the primary display. */
  displayId?: number
  /** Collapsed to a slim tab (hover to peek, click the handle to expand). */
  islandCollapsed: boolean
  launchAtLogin: boolean
  theme: ThemeMode
}

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 3
export const MIN_REFRESH_INTERVAL_MINUTES = 1
export const MAX_REFRESH_INTERVAL_MINUTES = 120

/** Thresholds that drive ring/bar colouring. */
export const USAGE_WARN_PERCENT = 40
export const USAGE_CRITICAL_PERCENT = 70

export function primaryMetric(snapshot?: UsageSnapshot): UsageMetric | undefined {
  return snapshot?.metrics?.[0]
}

/**
 * Geometry shared by the main process (window bounds) and the renderer
 * (island placement inside the transparent window). The window is
 * deliberately larger than the island so the hover popover has room to
 * appear beside it; transparent areas pass clicks through to whatever is
 * underneath.
 */
export const ISLAND_LAYOUT = {
  windowWidth: 480,
  windowHeight: 640,
  /** Distance from the window's top to the island's top. */
  islandInsetTop: 100,
  islandWidth: 108
} as const

/** Central registry of every IPC channel name, so main/preload/renderer never hand-type a string. */
export const IpcChannel = {
  UsageGetAll: 'usage:getAll',
  UsageRefresh: 'usage:refresh',
  UsageUpdated: 'usage:updated',
  UsageSyncState: 'usage:syncState',
  UsageOpenLogin: 'usage:openLogin',
  UsageOpenDashboard: 'usage:openDashboard',
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  SettingsUpdated: 'settings:updated',
  ProvidersList: 'providers:list',
  WindowSetIgnoreMouse: 'window:setIgnoreMouse',
  WindowShowContextMenu: 'window:showContextMenu',
  WindowOpenSettings: 'window:openSettings',
  AppQuit: 'app:quit'
} as const
