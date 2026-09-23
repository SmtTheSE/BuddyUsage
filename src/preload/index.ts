import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/types'
import type {
  ActivityReport,
  AgentsState,
  AppSettings,
  HookStatus,
  NudgeResult,
  ProviderMeta,
  RemoteInfo,
  UsageForecast,
  SyncState,
  UpdateState,
  UsageSnapshot
} from '@shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/**
 * The only surface the renderer ever touches. Keeping it a thin, typed
 * wrapper over IPC means the renderer has zero Electron/Node imports and
 * could in principle be swapped for a web build later without touching main.
 */
const api = {
  listProviders: (): Promise<ProviderMeta[]> => ipcRenderer.invoke(IpcChannel.ProvidersList),
  getAllUsage: (): Promise<UsageSnapshot[]> => ipcRenderer.invoke(IpcChannel.UsageGetAll),
  getSyncState: (): Promise<Record<string, boolean>> => ipcRenderer.invoke(IpcChannel.UsageSyncState),
  refreshUsage: (providerId?: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.UsageRefresh, providerId),
  openLogin: (providerId: string): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannel.UsageOpenLogin, providerId),
  openDashboard: (providerId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.UsageOpenDashboard, providerId),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.SettingsGet),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch),
  setIgnoreMouse: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.WindowSetIgnoreMouse, ignore),
  showContextMenu: (providerId?: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.WindowShowContextMenu, providerId),
  openSettings: (): Promise<void> => ipcRenderer.invoke(IpcChannel.WindowOpenSettings),
  setFocusable: (focusable: boolean): Promise<void> => ipcRenderer.invoke(IpcChannel.WindowSetFocusable, focusable),
  quit: (): Promise<void> => ipcRenderer.invoke(IpcChannel.AppQuit),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke(IpcChannel.UpdateGetState),
  checkForUpdates: (): Promise<UpdateState> => ipcRenderer.invoke(IpcChannel.UpdateCheck),
  installUpdate: (): Promise<UpdateState> => ipcRenderer.invoke(IpcChannel.UpdateInstall),
  openDownloadPage: (): Promise<void> => ipcRenderer.invoke(IpcChannel.UpdateOpenDownload),
  onUpdateState: (callback: (state: UpdateState) => void): (() => void) =>
    subscribe(IpcChannel.UpdateState, callback),
  onUsageUpdated: (callback: (snapshot: UsageSnapshot) => void): (() => void) =>
    subscribe(IpcChannel.UsageUpdated, callback),
  onSettingsUpdated: (callback: (settings: AppSettings) => void): (() => void) =>
    subscribe(IpcChannel.SettingsUpdated, callback),
  onSyncStateChanged: (callback: (state: SyncState) => void): (() => void) =>
    subscribe(IpcChannel.UsageSyncState, callback),

  // Agent control
  getAgents: (): Promise<AgentsState> => ipcRenderer.invoke(IpcChannel.AgentsGet),
  onAgentsUpdated: (callback: (state: AgentsState) => void): (() => void) => subscribe(IpcChannel.AgentsUpdated, callback),
  stopAgent: (id: string, force?: boolean): Promise<boolean> => ipcRenderer.invoke(IpcChannel.AgentsStop, id, force),
  focusAgent: (id: string): Promise<boolean> => ipcRenderer.invoke(IpcChannel.AgentsFocus, id),
  nudgeAgent: (providerId: string, text: string, sessionId?: string): Promise<NudgeResult> =>
    ipcRenderer.invoke(IpcChannel.AgentsNudge, providerId, text, sessionId),
  resumePaused: (providerId?: string): Promise<number> => ipcRenderer.invoke(IpcChannel.AgentsResume, providerId),
  resumeCommand: (providerId: string, cwd?: string, sessionId?: string): Promise<string> =>
    ipcRenderer.invoke(IpcChannel.AgentsResumeCommand, providerId, cwd, sessionId),
  dismissPaused: (providerId?: string): Promise<void> => ipcRenderer.invoke(IpcChannel.AgentsDismissPaused, providerId),
  getHookStatuses: (): Promise<HookStatus[]> => ipcRenderer.invoke(IpcChannel.HooksStatus),
  installHooks: (providerId: string): Promise<HookStatus> => ipcRenderer.invoke(IpcChannel.HooksInstall, providerId),
  uninstallHooks: (providerId: string): Promise<HookStatus> => ipcRenderer.invoke(IpcChannel.HooksUninstall, providerId),
  getRemoteInfo: (): Promise<RemoteInfo> => ipcRenderer.invoke(IpcChannel.RemoteInfo),

  // Local insights
  openActivity: (): Promise<void> => ipcRenderer.invoke(IpcChannel.WindowOpenActivity),
  getActivity: (rangeDays: number): Promise<ActivityReport> => ipcRenderer.invoke(IpcChannel.ActivityGet, rangeDays),
  rescanActivity: (rangeDays: number): Promise<ActivityReport> => ipcRenderer.invoke(IpcChannel.ActivityRescan, rangeDays),
  getForecasts: (): Promise<Record<string, UsageForecast>> => ipcRenderer.invoke(IpcChannel.ForecastGetAll),
  onActivityUpdated: (callback: (scanning: boolean) => void): (() => void) => subscribe(IpcChannel.ActivityUpdated, callback),
  regenerateRemote: (): Promise<RemoteInfo> => ipcRenderer.invoke(IpcChannel.RemoteRegenerate)
}

export type BuddyUsageApi = typeof api

contextBridge.exposeInMainWorld('buddyUsage', api)
