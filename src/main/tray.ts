import { Tray, Menu, nativeImage, app } from 'electron'
import trayIcon1x from '../../resources/trayTemplate.png?asset'
import trayIcon2x from '../../resources/trayTemplate@2x.png?asset'
import trayIconColor from '../../resources/trayColor.png?asset'
import { refreshProviderNow } from './scraping/scheduler'
import { getIslandWindow } from './windows/islandWindow'
import { openSettingsWindow } from './windows/settingsWindow'
import { openActivityWindow } from './windows/activityWindow'
import { providerRegistry } from './providers/registry'
import { requestProviderLogin } from './scraping/scrapeRunner'
import { checkForUpdates, getUpdateState, installUpdate, onUpdateState } from './updates/updater'
import { getAllSnapshots, onSnapshotUpdated } from './store/usageStore'
import { getSettings } from './store/settings'
import { primaryMetric } from '@shared/types'

let tray: Tray | null = null

/** A tray with an empty image is invisible on Windows — surface a missing asset loudly instead. */
function loadTrayAsset(path: string): Electron.NativeImage {
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) console.error(`[tray] icon asset missing or unreadable: ${path}`)
  return image
}

function buildTrayImage(): Electron.NativeImage {
  // macOS recolours template images itself; Windows/Linux taskbars need a
  // fixed-colour glyph (white reads on both light and dark trays).
  if (process.platform !== 'darwin') return loadTrayAsset(trayIconColor)

  const image = nativeImage.createEmpty()
  image.addRepresentation({ scaleFactor: 1, dataURL: loadTrayAsset(trayIcon1x).toDataURL() })
  image.addRepresentation({ scaleFactor: 2, dataURL: loadTrayAsset(trayIcon2x).toDataURL() })
  // Template images let macOS recolour the glyph for light/dark menu bars.
  image.setTemplateImage(true)
  return image
}

/**
 * The island has no titlebar/dock presence (by design), so the tray is the
 * always-available way to reach settings, sign-in, refresh and quit.
 */
function buildMenu(): Menu {
  const update = getUpdateState()
  const updateItem: Electron.MenuItemConstructorOptions =
    update.status === 'available'
      ? { label: `Update to ${update.latestVersion}…`, click: () => void installUpdate() }
      : update.status === 'downloading'
        ? { label: `Downloading update… ${update.progress ?? 0}%`, enabled: false }
        : { label: 'Check for Updates…', click: () => void checkForUpdates({ notify: true }) }

  return Menu.buildFromTemplate([
    { label: 'Refresh All', click: () => void refreshProviderNow() },
    {
      label: 'Sign in',
      submenu: providerRegistry.map((provider) => ({
        label: `${provider.name}…`,
        click: () => void requestProviderLogin(provider)
      }))
    },
    { type: 'separator' },
    { label: 'Show Island', click: () => getIslandWindow()?.show() },
    { label: 'Activity…', click: () => openActivityWindow() },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { type: 'separator' },
    updateItem,
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit BuddyUsage', click: () => app.quit() }
  ])
}

/** Optional at-a-glance readout beside the icon: the highest usage across enabled providers. */
export function refreshTrayTitle(): void {
  if (!tray || process.platform !== 'darwin') return
  const settings = getSettings()
  if (!settings.menuBarUsage) {
    tray.setTitle('')
    return
  }
  const percents = getAllSnapshots()
    .filter((s) => settings.enabledProviders[s.providerId] !== false && (s.status === 'ok' || s.status === 'stale'))
    .map((s) => primaryMetric(s)?.percentUsed)
    .filter((p): p is number => typeof p === 'number')
  tray.setTitle(percents.length ? ` ${Math.max(...percents)}%` : '', { fontType: 'monospacedDigit' })
}

export function createTray(): Tray {
  tray = new Tray(buildTrayImage())
  tray.setToolTip('BuddyUsage')
  tray.setContextMenu(buildMenu())
  // Rebuild so the update item reflects the latest state when opened.
  onUpdateState(() => tray?.setContextMenu(buildMenu()))
  onSnapshotUpdated(refreshTrayTitle)
  refreshTrayTitle()
  return tray
}
