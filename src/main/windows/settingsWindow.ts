import { BrowserWindow } from 'electron'
import { join } from 'path'
import { rendererEntry } from './islandWindow'

let settingsWindow: BrowserWindow | null = null

/** A normal, focusable window for Settings — the island itself is a non-activating overlay. */
export function openSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 560,
    title: 'BuddyUsage Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    // Inset traffic lights on macOS; a normal titlebar elsewhere.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    autoHideMenuBar: true,
    backgroundColor: '#121214',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  const entry = rendererEntry('#settings')
  if (entry.url) settingsWindow.loadURL(entry.url + entry.hash)
  else settingsWindow.loadFile(entry.file!, { hash: 'settings' })

  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  return settingsWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
}
