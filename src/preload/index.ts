import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/types'
import type { AppSettings, ProviderMeta, UsageSnapshot } from '@shared/types'

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
  quit: (): Promise<void> => ipcRenderer.invoke(IpcChannel.AppQuit),
  onUsageUpdated: (callback: (snapshot: UsageSnapshot) => void): (() => void) =>
    subscribe(IpcChannel.UsageUpdated, callback),
  onSettingsUpdated: (callback: (settings: AppSettings) => void): (() => void) =>
    subscribe(IpcChannel.SettingsUpdated, callback)
}

export type BuddyUsageApi = typeof api

contextBridge.exposeInMainWorld('buddyUsage', api)
