import { BrowserWindow } from 'electron'
import { join } from 'path'
import { rendererEntry } from './islandWindow'

let activityWindow: BrowserWindow | null = null

/** A normal window for the Activity report — wider than Settings, and resizable because it holds charts. */
export function openActivityWindow(): BrowserWindow {
  if (activityWindow && !activityWindow.isDestroyed()) {
    activityWindow.show()
    activityWindow.focus()
    return activityWindow
  }

  activityWindow = new BrowserWindow({
    width: 760,
    height: 780,
    minWidth: 620,
    minHeight: 560,
    title: 'BuddyUsage Activity',
    show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    autoHideMenuBar: true,
    backgroundColor: '#121214',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  const entry = rendererEntry('#activity')
  if (entry.url) activityWindow.loadURL(entry.url + entry.hash)
  else activityWindow.loadFile(entry.file!, { hash: 'activity' })

  activityWindow.once('ready-to-show', () => activityWindow?.show())
  activityWindow.on('closed', () => {
    activityWindow = null
  })
  return activityWindow
}
