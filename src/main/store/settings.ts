import Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { DEFAULT_REFRESH_INTERVAL_MINUTES } from '@shared/types'
import { providerRegistry } from '../providers/registry'

const CURRENT_SCHEMA_VERSION = 2

function defaultSettings(): AppSettings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
    enabledProviders: Object.fromEntries(providerRegistry.map((p) => [p.id, true])),
    edge: 'right',
    verticalOffset: 120,
    launchAtLogin: false,
    theme: 'auto'
  }
}

const store = new Store<{ settings: AppSettings }>({
  name: 'buddy-usage-settings',
  defaults: { settings: defaultSettings() }
})

/**
 * Schema migration hook: bump CURRENT_SCHEMA_VERSION and add a branch here
 * whenever AppSettings shape changes, so upgrades never crash on old data.
 */
function migrate(stored: Partial<AppSettings> & Record<string, unknown>): AppSettings {
  const defaults = defaultSettings()
  if (stored.schemaVersion === CURRENT_SCHEMA_VERSION) return { ...defaults, ...stored } as AppSettings

  // v1 -> v2: the top-notch/pill layout was replaced by an edge-docked
  // island; drop `windowMode` and reset the offset to the new default.
  const { windowMode: _windowMode, verticalOffset: _offset, ...rest } = stored
  return { ...defaults, ...rest, schemaVersion: CURRENT_SCHEMA_VERSION }
}

export function getSettings(): AppSettings {
  const migrated = migrate(store.get('settings') as Partial<AppSettings> & Record<string, unknown>)
  // New providers added after a user's first run should default to enabled.
  for (const provider of providerRegistry) {
    if (!(provider.id in migrated.enabledProviders)) {
      migrated.enabledProviders[provider.id] = true
    }
  }
  return migrated
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...getSettings(), ...patch }
  store.set('settings', next)
  return next
}
