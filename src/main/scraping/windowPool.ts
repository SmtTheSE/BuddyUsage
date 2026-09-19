import { BrowserWindow, session } from 'electron'
import type { ProviderDefinition } from '../providers/types'

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const pool = new Map<string, BrowserWindow>()

/**
 * One hidden, persistent-session BrowserWindow per provider, created lazily
 * and reused across scrapes/logins so cookies and page state survive between
 * polls. A real desktop Chrome UA avoids the "unsupported browser" walls some
 * OAuth providers show to unrecognized user agents.
 */
export function getProviderWindow(provider: ProviderDefinition): BrowserWindow {
  const existing = pool.get(provider.id)
  if (existing && !existing.isDestroyed()) return existing

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      session: session.fromPartition(provider.sessionPartition),
      sandbox: true,
      contextIsolation: true
    }
  })
  win.webContents.setUserAgent(DESKTOP_USER_AGENT)
  // The window is shown only for sign-in; the red close button should just
  // dismiss it (cancelling sign-in) rather than destroy the scraping window.
  win.on('close', (event) => {
    event.preventDefault()
    win.hide()
  })
  pool.set(provider.id, win)
  return win
}

export function destroyAllProviderWindows(): void {
  for (const win of pool.values()) {
    if (!win.isDestroyed()) win.destroy()
  }
  pool.clear()
}
