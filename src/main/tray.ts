import { Tray, Menu, nativeImage, app } from 'electron'
import trayIcon1x from '../../resources/trayTemplate.png?asset'
import trayIcon2x from '../../resources/trayTemplate@2x.png?asset'
import trayIconColor from '../../resources/trayColor.png?asset'
import { refreshProviderNow } from './scraping/scheduler'
import { getIslandWindow } from './windows/islandWindow'
import { openSettingsWindow } from './windows/settingsWindow'
import { providerRegistry } from './providers/registry'
import { requestProviderLogin } from './scraping/scrapeRunner'

let tray: Tray | null = null

function buildTrayImage(): Electron.NativeImage {
  // macOS recolours template images itself; Windows/Linux taskbars need a
  // fixed-colour glyph (white reads on both light and dark trays).
  if (process.platform !== 'darwin') return nativeImage.createFromPath(trayIconColor)

  const image = nativeImage.createEmpty()
  image.addRepresentation({ scaleFactor: 1, dataURL: nativeImage.createFromPath(trayIcon1x).toDataURL() })
  image.addRepresentation({ scaleFactor: 2, dataURL: nativeImage.createFromPath(trayIcon2x).toDataURL() })
  // Template images let macOS recolour the glyph for light/dark menu bars.
  image.setTemplateImage(true)
  return image
}

/**
 * The island has no titlebar/dock presence (by design), so the tray is the
 * always-available way to reach settings, sign-in, refresh and quit.
 */
export function createTray(): Tray {
  tray = new Tray(buildTrayImage())
  tray.setToolTip('BuddyUsage')

  const menu = Menu.buildFromTemplate([
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
    { label: 'Settings…', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit BuddyUsage', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  return tray
}
