import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ISLAND_LAYOUT, type AppSettings, type ScreenEdge } from '@shared/types'
import { getSettings } from '../store/settings'

let islandWindow: BrowserWindow | null = null
let snapping = false
let moveDebounce: ReturnType<typeof setTimeout> | undefined
let onUserMoved: ((patch: Partial<AppSettings>) => void) | null = null

// Keep the island's top within the work area, leaving room for its body.
const MIN_VISIBLE_HEIGHT = 200

export function rendererEntry(hash = ''): { url?: string; file?: string; hash: string } {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: process.env['ELECTRON_RENDERER_URL'], hash }
  }
  return { file: join(__dirname, '../renderer/index.html'), hash }
}

function targetDisplay(settings: AppSettings): Display {
  const wanted = settings.displayId
  return screen.getAllDisplays().find((d) => d.id === wanted) ?? screen.getPrimaryDisplay()
}

/**
 * The island docks to the edge of the display's *work area*, not its raw
 * bounds — the work area excludes the Dock (which users put on any side),
 * the menu bar and the Windows taskbar, so the island is never hidden
 * underneath system chrome.
 */
function computeBounds(settings = getSettings()): Rectangle {
  const display = targetDisplay(settings)
  const area = display.workArea
  const { windowWidth, windowHeight, islandInsetTop } = ISLAND_LAYOUT

  const x = settings.edge === 'left' ? area.x : area.x + area.width - windowWidth
  const maxOffset = Math.max(0, area.height - MIN_VISIBLE_HEIGHT)
  const offset = Math.min(Math.max(0, settings.verticalOffset), maxOffset)
  // The island itself sits `islandInsetTop` below the window's top edge, so
  // offset the window upward by that much to make `verticalOffset` mean
  // "distance from the top of the usable screen to the island".
  const y = area.y + offset - islandInsetTop
  return { x, y, width: windowWidth, height: windowHeight }
}

/** Where a window dropped by the user should snap to: nearest edge of the display it's mostly on. */
function snapTarget(bounds: Rectangle): Partial<AppSettings> {
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const centerX = bounds.x + bounds.width / 2
  const edge: ScreenEdge = centerX < area.x + area.width / 2 ? 'left' : 'right'
  const verticalOffset = Math.round(bounds.y + ISLAND_LAYOUT.islandInsetTop - area.y)
  return { edge, verticalOffset, displayId: display.id }
}

function handleUserMove(): void {
  const win = getIslandWindow()
  if (!win || snapping || !onUserMoved) return
  const patch = snapTarget(win.getBounds())
  const current = getSettings()
  if (
    patch.edge === current.edge &&
    patch.verticalOffset === current.verticalOffset &&
    patch.displayId === current.displayId
  ) {
    return
  }
  onUserMoved(patch)
}

export function createIslandWindow(handleMoved: (patch: Partial<AppSettings>) => void): BrowserWindow {
  onUserMoved = handleMoved

  islandWindow = new BrowserWindow({
    ...computeBounds(),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    // Draggable by its glass body (renderer marks it as an app drag region);
    // on release it snaps to the nearest screen edge and the spot is saved.
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    // A non-activating panel never steals keyboard focus from the app the
    // user is actually working in — clicks on the island still register.
    // 'panel' is a macOS-only window type; other platforms get the same
    // effect from focusable: false alone.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
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

  // macOS emits 'moved' once when a drag ends; elsewhere 'move' streams
  // during the drag, so settle on a short debounce.
  if (process.platform === 'darwin') {
    islandWindow.on('moved', handleUserMove)
  } else {
    islandWindow.on('move', () => {
      if (moveDebounce) clearTimeout(moveDebounce)
      moveDebounce = setTimeout(handleUserMove, 250)
    })
  }

  screen.on('display-metrics-changed', repositionIslandWindow)
  screen.on('display-added', repositionIslandWindow)
  screen.on('display-removed', repositionIslandWindow)

  return islandWindow
}

export function getIslandWindow(): BrowserWindow | null {
  return islandWindow && !islandWindow.isDestroyed() ? islandWindow : null
}

export function repositionIslandWindow(): void {
  const win = getIslandWindow()
  if (!win) return
  snapping = true
  win.setBounds(computeBounds(), process.platform === 'darwin')
  // Let the programmatic move's own 'moved'/'move' events pass before we
  // start treating movement as user-initiated again.
  setTimeout(() => {
    snapping = false
  }, 400)
}

/**
 * The window is mostly transparent; only the island and its popover should
 * catch the mouse. The renderer reports which region the cursor is over and
 * we toggle click-through accordingly (`forward: true` keeps mousemove
 * flowing so the renderer can flip it back when the cursor re-enters).
 */
export function setIgnoreMouse(ignore: boolean): void {
  // Linux can't forward mouse moves through an ignored window, so hover
  // would never re-enable input there; the window simply stays solid.
  if (process.platform === 'linux') return
  getIslandWindow()?.setIgnoreMouseEvents(ignore, { forward: true })
}
