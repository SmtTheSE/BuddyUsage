import { app, BrowserWindow, clipboard, ipcMain, Menu, shell } from 'electron'
import { IpcChannel, type AppSettings } from '@shared/types'
import { providerRegistry, getProvider } from './providers/registry'
import { getAllSnapshots, getSnapshot, onSnapshotUpdated } from './store/usageStore'
import { getSettings, updateSettings } from './store/settings'
import { refreshProviderNow, restartScrapeScheduler } from './scraping/scheduler'
import { isSyncing, onSyncStateChanged, requestProviderLogin } from './scraping/scrapeRunner'
import { getIslandWindow, repositionIslandWindow, setIgnoreMouse } from './windows/islandWindow'
import { openSettingsWindow } from './windows/settingsWindow'
import { refreshTrayTitle } from './tray'
import { checkForUpdates, getUpdateState, installUpdate, onUpdateState, openDownloadPage } from './updates/updater'

/**
 * Everything needed to debug a wrong reading, ready to paste into an issue:
 * what the app parsed and the text/JSON it parsed it from. Lets a
 * non-technical user report a bad number without touching a terminal.
 */
function diagnosticsFor(providerId: string): string {
  const snapshot = getSnapshot(providerId)
  const { raw, ...parsed } = snapshot ?? { raw: undefined }
  return [
    `BuddyUsage ${app.getVersion()} · ${process.platform} ${process.arch}`,
    `Provider: ${providerId}`,
    `Captured: ${new Date().toISOString()}`,
    '',
    '--- parsed ---',
    JSON.stringify(parsed, null, 2),
    '',
    '--- page ---',
    raw ?? '(nothing captured yet)'
  ].join('\n')
}

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
  refreshTrayTitle()
  broadcast(IpcChannel.SettingsUpdated, next)
  return next
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.ProvidersList, () =>
    providerRegistry.map((p) => ({ id: p.id, name: p.name, color: p.color, usageUrl: p.usageUrl }))
  )

  ipcMain.handle(IpcChannel.UsageGetAll, () => getAllSnapshots())

  ipcMain.handle(IpcChannel.UsageSyncState, () =>
    Object.fromEntries(providerRegistry.map((p) => [p.id, isSyncing(p.id)]))
  )

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

  ipcMain.handle(IpcChannel.UpdateGetState, () => getUpdateState())
  ipcMain.handle(IpcChannel.UpdateCheck, () => checkForUpdates())
  ipcMain.handle(IpcChannel.UpdateInstall, () => installUpdate())
  ipcMain.handle(IpcChannel.UpdateOpenDownload, () => openDownloadPage())

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
        { label: 'Copy diagnostics', click: () => clipboard.writeText(diagnosticsFor(provider.id)) },
        { type: 'separator' }
      )
    }

    const update = getUpdateState()
    if (update.status === 'available') {
      template.push(
        { label: `Update to ${update.latestVersion}…`, click: () => void installUpdate() },
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
  onSyncStateChanged((state) => broadcast(IpcChannel.UsageSyncState, state))
  onUpdateState((state) => broadcast(IpcChannel.UpdateState, state))
}
