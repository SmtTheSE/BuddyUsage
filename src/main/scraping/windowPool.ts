import { BrowserWindow, session } from 'electron'
import { join } from 'path'
import type { ProviderDefinition } from '../providers/types'
import { applyChromeIdentity } from './browserIdentity'

const pool = new Map<string, BrowserWindow>()
const preparedPartitions = new Set<string>()

/**
 * One hidden, persistent-session BrowserWindow per provider, created lazily
 * and reused across scrapes/logins so cookies and page state survive between
 * polls. Each session is dressed up as a plain Chrome build (UA, client
 * hints, `window.chrome`) so providers' sign-in flows — Google's especially
 * — don't reject it as an embedded browser.
 */
export function getProviderWindow(provider: ProviderDefinition): BrowserWindow {
  const existing = pool.get(provider.id)
  if (existing && !existing.isDestroyed()) return existing

  const providerSession = session.fromPartition(provider.sessionPartition)
  if (!preparedPartitions.has(provider.sessionPartition)) {
    applyChromeIdentity(providerSession)
    preparedPartitions.add(provider.sessionPartition)
  }

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    title: `Sign in — ${provider.name}`,
    webPreferences: {
      session: providerSession,
      sandbox: true,
      // The identity preload must run in the page's own world so the page
      // sees a populated `window.chrome`. It exposes nothing and has no IPC
      // access, so dropping isolation here grants the page no capability.
      contextIsolation: false,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/identity.js')
    }
  })

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
