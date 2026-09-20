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
  | 'no_meter' // signed in, but this plan (typically Free) publishes no usage meter

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
  /** The same reset as an absolute ISO time, when the phrase could be parsed — lets the UI count down live. */
  resetsAt?: string
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

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  downloadUrl?: string
  downloadSize?: number
  notes?: string
  /** 0–100 while downloading. */
  progress?: number
  error?: string
  checkedAt?: string
}

export interface ProviderMeta {
  id: ProviderId
  name: string
  color: string
  usageUrl: string
  /** Whether this provider has a local CLI agent BuddyUsage can watch and steer. */
  agent?: boolean
}

// ---------------------------------------------------------------------------
// Agents: the local CLI sessions (claude, codex, gemini) that spend the limits
// ---------------------------------------------------------------------------

export type AgentAttentionKind = 'permission' | 'idle' | 'finished'

export interface AgentAttention {
  kind: AgentAttentionKind
  message?: string
  at: string
}

export type AgentSessionState = 'running' | 'attention' | 'stopping'

/** One live CLI session, found by process scan and enriched by hook events. */
export interface AgentSession {
  /** Stable id: `${providerId}:${pid}` for a process, `${providerId}:hook:${sessionId}` for a hook-only entry. */
  id: string
  providerId: ProviderId
  pid?: number
  /** Working directory of the session — the project it is working in. */
  cwd?: string
  project?: string
  startedAt?: string
  /** The CLI's own conversation id, when known — what a nudge or resume targets. */
  sessionId?: string
  /** The app hosting the terminal (Terminal, iTerm2, Code, Claude…), for "jump to it". */
  hostApp?: string
  state: AgentSessionState
  attention?: AgentAttention
  /** True when the limit guard stopped this session. */
  pausedByGuard?: boolean
}

/** A session the limit guard stopped, kept so it can be resumed after the reset. */
export interface PausedSession {
  providerId: ProviderId
  cwd?: string
  project?: string
  sessionId?: string
  pausedAt: string
  percentAtPause: number
}

export interface AgentsState {
  sessions: AgentSession[]
  paused: PausedSession[]
  /** Whether process scanning works on this machine (false → only hook events are shown). */
  scanAvailable: boolean
}

export interface NudgeResult {
  providerId: ProviderId
  ok: boolean
  reply?: string
  error?: string
  /** Command that was run, for transparency. */
  command: string
}

export type HookInstallStatus = 'installed' | 'not_installed' | 'conflict' | 'unsupported'

export interface HookStatus {
  providerId: ProviderId
  status: HookInstallStatus
  /** Human-readable detail: where it was installed, or what is in the way. */
  detail?: string
}

export interface RemoteInfo {
  enabled: boolean
  /** Full URL to open on the phone, when enabled and a LAN address exists. */
  url?: string
  /** SVG markup of the QR code for `url`. */
  qrSvg?: string
  addresses: string[]
  port: number
}

export interface LimitGuardSettings {
  enabled: boolean
  /** Primary-metric percentage at which running sessions are stopped. */
  percent: number
  /** Which providers the guard applies to; missing = true. */
  providers: Record<ProviderId, boolean>
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
  /** Show the highest usage percentage next to the menu-bar icon (macOS). */
  menuBarUsage: boolean
  /** The first-run hint has been dismissed. */
  onboardingSeen: boolean
  launchAtLogin: boolean
  theme: ThemeMode
  /** Stop running agents when a provider's primary limit passes a threshold. */
  limitGuard: LimitGuardSettings
  /** System notifications for hook events (waiting for permission, finished). */
  agentAlerts: boolean
  /** Serve the phone page on the LAN. Off → hooks only, bound to localhost. */
  remoteEnabled: boolean
  /** Secret in the remote/hook URLs; regenerate to revoke. */
  remoteToken: string
}

export const DEFAULT_LIMIT_GUARD_PERCENT = 90

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
  windowHeight: 920,
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
  WindowSetFocusable: 'window:setFocusable',
  AppQuit: 'app:quit',
  UpdateGetState: 'update:getState',
  UpdateCheck: 'update:check',
  UpdateInstall: 'update:install',
  UpdateOpenDownload: 'update:openDownload',
  UpdateState: 'update:state',
  AgentsGet: 'agents:get',
  AgentsUpdated: 'agents:updated',
  AgentsStop: 'agents:stop',
  AgentsFocus: 'agents:focus',
  AgentsNudge: 'agents:nudge',
  AgentsResume: 'agents:resume',
  AgentsResumeCommand: 'agents:resumeCommand',
  AgentsDismissPaused: 'agents:dismissPaused',
  HooksStatus: 'hooks:status',
  HooksInstall: 'hooks:install',
  HooksUninstall: 'hooks:uninstall',
  RemoteInfo: 'remote:info',
  RemoteRegenerate: 'remote:regenerate'
} as const
