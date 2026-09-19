import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { IpcChannel, type AppSettings } from '@shared/types'
import { providerRegistry, getProvider } from './providers/registry'
import { getAllSnapshots, onSnapshotUpdated } from './store/usageStore'
import { getSettings, updateSettings } from './store/settings'
import { refreshProviderNow, restartScrapeScheduler } from './scraping/scheduler'
import { requestProviderLogin } from './scraping/scrapeRunner'
import { getIslandWindow, repositionIslandWindow, setIgnoreMouse } from './windows/islandWindow'
import { openSettingsWindow } from './windows/settingsWindow'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function applySettings(patch: Partial<AppSettings>): AppSettings {
  const next = updateSettings(patch)
  restartScrapeScheduler()
  repositionIslandWindow()
  if (patch.launchAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
  }
  broadcast(IpcChannel.SettingsUpdated, next)
  return next
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.ProvidersList, () =>
    providerRegistry.map((p) => ({ id: p.id, name: p.name, color: p.color, usageUrl: p.usageUrl }))
  )

  ipcMain.handle(IpcChannel.UsageGetAll, () => getAllSnapshots())

  ipcMain.handle(IpcChannel.UsageRefresh, (_event, providerId?: string) =>
    refreshProviderNow(providerId)
  )

  ipcMain.handle(IpcChannel.UsageOpenLogin, async (_event, providerId: string) => {
    const provider = getProvider(providerId)
    if (!provider) return false
    return requestProviderLogin(provider)
  })

  ipcMain.handle(IpcChannel.UsageOpenDashboard, (_event, providerId: string) => {
    const provider = getProvider(providerId)
    if (provider) void shell.openExternal(provider.usageUrl)
  })

  ipcMain.handle(IpcChannel.SettingsGet, () => getSettings())

  ipcMain.handle(IpcChannel.SettingsUpdate, (_event, patch: Partial<AppSettings>) =>
    applySettings(patch)
  )

  ipcMain.handle(IpcChannel.WindowSetIgnoreMouse, (_event, ignore: boolean) => {
    setIgnoreMouse(ignore)
  })

  ipcMain.handle(IpcChannel.WindowOpenSettings, () => {
    openSettingsWindow()
  })

  ipcMain.handle(IpcChannel.AppQuit, () => app.quit())

  // Right-click on a ring: the island has no chrome of its own, so this is
  // where sign-in / refresh / dashboard / settings / quit live.
  ipcMain.handle(IpcChannel.WindowShowContextMenu, (_event, providerId?: string) => {
    const provider = providerId ? getProvider(providerId) : undefined
    const template: Electron.MenuItemConstructorOptions[] = []

    if (provider) {
      template.push(
        { label: `Refresh ${provider.name}`, click: () => void refreshProviderNow(provider.id) },
        { label: `Sign in to ${provider.name}…`, click: () => void requestProviderLogin(provider) },
        { label: `Open ${provider.name} dashboard`, click: () => void shell.openExternal(provider.usageUrl) },
        { type: 'separator' }
      )
    }

    template.push(
      { label: 'Refresh all', click: () => void refreshProviderNow() },
      { label: 'Settings…', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: 'Quit BuddyUsage', click: () => app.quit() }
    )

    const win = getIslandWindow()
    if (win) Menu.buildFromTemplate(template).popup({ window: win })
  })

  // Push snapshot updates to every renderer as they land, instead of polling.
  onSnapshotUpdated((snapshot) => broadcast(IpcChannel.UsageUpdated, snapshot))
}
