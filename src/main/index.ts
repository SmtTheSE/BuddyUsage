import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createIslandWindow, getIslandWindow } from './windows/islandWindow'
import { createTray } from './tray'
import { applySettings, registerIpcHandlers } from './ipc'
import { startScrapeScheduler, stopScrapeScheduler } from './scraping/scheduler'
import { destroyAllProviderWindows } from './scraping/windowPool'
import { getSettings } from './store/settings'
import { CHROME_USER_AGENT } from './scraping/browserIdentity'
import { startUpdateChecks } from './updates/updater'
import { startAgents, stopAgents } from './agents'

// Default UA for every session, so nothing anywhere advertises "Electron".
app.userAgentFallback = CHROME_USER_AGENT

// Linux compositors need this before any window exists for `transparent:
// true` to actually produce a transparent surface.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals')

// This is a menu-bar-style utility app: no Dock icon, single instance, lives
// entirely in the island overlay + tray.

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    getIslandWindow()?.show()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.buddyusage.app')
    if (app.dock) app.dock.hide()

    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Keep the OS login item in sync with the persisted preference.
    app.setLoginItemSettings({ openAtLogin: getSettings().launchAtLogin })

    registerIpcHandlers()
    createIslandWindow(applySettings)
    createTray()
    startScrapeScheduler()
    void startAgents()
    if (app.isPackaged) startUpdateChecks()

    app.on('activate', () => {
      const island = getIslandWindow()
      if (island) island.show()
      else createIslandWindow(applySettings)
    })
  })

  app.on('window-all-closed', () => {
    // Utility app: stay alive in the tray even with no window open (e.g. after
    // an accidental close), matching the menu-bar-app convention on macOS.
  })

  app.on('before-quit', () => {
    stopScrapeScheduler()
    void stopAgents()
    destroyAllProviderWindows()
  })
}
