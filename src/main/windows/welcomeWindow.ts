import { BrowserWindow } from 'electron'
import { join } from 'path'
import { rendererEntry } from './islandWindow'

let welcomeWindow: BrowserWindow | null = null

/** First-run walkthrough. A plain, focusable window: the island itself can't take focus. */
export function openWelcomeWindow(): BrowserWindow {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.show()
    welcomeWindow.focus()
    return welcomeWindow
  }

  welcomeWindow = new BrowserWindow({
    width: 540,
    height: 620,
    title: 'Welcome to BuddyUsage',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
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

  const entry = rendererEntry('#welcome')
  if (entry.url) welcomeWindow.loadURL(entry.url + entry.hash)
  else welcomeWindow.loadFile(entry.file!, { hash: 'welcome' })

  welcomeWindow.once('ready-to-show', () => welcomeWindow?.show())
  welcomeWindow.on('closed', () => {
    welcomeWindow = null
  })
  return welcomeWindow
}

export function closeWelcomeWindow(): void {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close()
}
