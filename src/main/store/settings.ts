import Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { DEFAULT_REFRESH_INTERVAL_MINUTES } from '@shared/types'
import { providerRegistry } from '../providers/registry'

const CURRENT_SCHEMA_VERSION = 3

function defaultSettings(): AppSettings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
    enabledProviders: Object.fromEntries(providerRegistry.map((p) => [p.id, p.defaultEnabled !== false])),
    edge: 'right',
    verticalOffset: 120,
    islandCollapsed: false,
    menuBarUsage: false,
    onboardingSeen: false,
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

  let next: Partial<AppSettings> & Record<string, unknown> = stored
  if ((next.schemaVersion ?? 1) < 2) {
    // v1 -> v2: the top-notch/pill layout was replaced by an edge-docked
    // island; drop `windowMode` and reset the offset to the new default.
    const { windowMode: _windowMode, verticalOffset: _offset, ...rest } = next
    next = rest
  }
  if ((next.schemaVersion ?? 1) < 3 && next.refreshIntervalMinutes === 10) {
    // v2 -> v3: the default poll dropped from 10 to 3 minutes now that
    // activity/reset/wake triggers carry most of the freshness; only move
    // users still on the old default.
    next = { ...next, refreshIntervalMinutes: defaults.refreshIntervalMinutes }
  }
  return { ...defaults, ...next, schemaVersion: CURRENT_SCHEMA_VERSION }
}

export function getSettings(): AppSettings {
  const migrated = migrate(store.get('settings') as Partial<AppSettings> & Record<string, unknown>)
  // Providers added after a user's first run pick up their own default.
  for (const provider of providerRegistry) {
    if (!(provider.id in migrated.enabledProviders)) {
      migrated.enabledProviders[provider.id] = provider.defaultEnabled !== false
    }
  }
  return migrated
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...getSettings(), ...patch }
  store.set('settings', next)
  return next
}
