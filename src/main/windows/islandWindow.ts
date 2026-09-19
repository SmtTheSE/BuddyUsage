import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ISLAND_LAYOUT } from '@shared/types'
import { getSettings } from '../store/settings'

let islandWindow: BrowserWindow | null = null

export function rendererEntry(hash = ''): { url?: string; file?: string; hash: string } {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: process.env['ELECTRON_RENDERER_URL'], hash }
  }
  return { file: join(__dirname, '../renderer/index.html'), hash }
}

function computeBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings()
  const display = screen.getPrimaryDisplay()
  const { windowWidth, windowHeight, islandInsetTop } = ISLAND_LAYOUT

  const x =
    settings.edge === 'left'
      ? display.bounds.x
      : display.bounds.x + display.bounds.width - windowWidth
  // The island itself sits `islandInsetTop` below the window's top edge, so
  // offset the window upward by that much to make `verticalOffset` mean
  // "distance from the top of the usable screen to the island".
  const y = display.workArea.y + settings.verticalOffset - islandInsetTop
  return { x, y, width: windowWidth, height: windowHeight }
}

export function createIslandWindow(): BrowserWindow {
  islandWindow = new BrowserWindow({
    ...computeBounds(),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    // A non-activating panel never steals keyboard focus from the app the
    // user is actually working in — clicks on the island still register.
    type: 'panel',
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  islandWindow.setAlwaysOnTop(true, 'floating')
  islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // A silent renderer failure (blocked script, thrown exception before
  // mount) must never leave the window permanently hidden with no signal —
  // surface it in the terminal, and show the window regardless after a
  // short grace period so it's never just invisible with no explanation.
  islandWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[island renderer] ${message} (${sourceId}:${line})`)
  })
  islandWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[island renderer] failed to load: ${description} (${code})`)
  })
  islandWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[island renderer] process gone: ${details.reason}`)
  })

  const entry = rendererEntry('#island')
  if (entry.url) islandWindow.loadURL(entry.url + entry.hash)
  else islandWindow.loadFile(entry.file!, { hash: 'island' })

  islandWindow.once('ready-to-show', () => islandWindow?.show())
  setTimeout(() => {
    if (islandWindow && !islandWindow.isDestroyed() && !islandWindow.isVisible()) {
      console.error('[island renderer] ready-to-show never fired — showing anyway')
      islandWindow.show()
    }
  }, 3000)

  screen.on('display-metrics-changed', repositionIslandWindow)
  screen.on('display-added', repositionIslandWindow)
  screen.on('display-removed', repositionIslandWindow)

  return islandWindow
}

export function getIslandWindow(): BrowserWindow | null {
  return islandWindow && !islandWindow.isDestroyed() ? islandWindow : null
}

export function repositionIslandWindow(): void {
  getIslandWindow()?.setBounds(computeBounds())
}

/**
 * The window is mostly transparent; only the island and its popover should
 * catch the mouse. The renderer reports which region the cursor is over and
 * we toggle click-through accordingly (`forward: true` keeps mousemove
 * flowing so the renderer can flip it back when the cursor re-enters).
 */
export function setIgnoreMouse(ignore: boolean): void {
  getIslandWindow()?.setIgnoreMouseEvents(ignore, { forward: true })
}
