import type { AppSettings, ProviderMeta, UsageSnapshot } from '@shared/types'

/**
 * Lets the renderer run in a plain browser tab (`npm run dev` then open
 * http://localhost:5173/#island) for fast UI iteration. Only installed when
 * the preload bridge is absent, i.e. never inside Electron.
 */
export function installDevMock(): void {
  const providers: ProviderMeta[] = [
    { id: 'claude', name: 'Claude', color: '#D97757', usageUrl: 'https://claude.ai/settings/usage' },
    { id: 'codex', name: 'Codex', color: '#10A37F', usageUrl: 'https://chatgpt.com/codex/settings/usage' },
    { id: 'gemini', name: 'Gemini', color: '#4285F4', usageUrl: 'https://gemini.google.com/app' }
  ]
  const now = new Date().toISOString()
  const snapshots: UsageSnapshot[] = [
    {
      providerId: 'claude',
      status: 'ok',
      planLabel: 'Max',
      lastSyncedAt: now,
      metrics: [
        { id: 'session', label: 'Current session', percentUsed: 73, resetLabel: 'in 51 min' },
        { id: 'weekly-all', label: 'All models', percentUsed: 7, resetLabel: 'Thu 12:00 AM' }
      ]
    },
    {
      providerId: 'codex',
      status: 'ok',
      lastSyncedAt: now,
      metrics: [
        { id: 'session', label: '5-hour limit', percentUsed: 21, resetLabel: 'in 3 hr 12 min' },
        { id: 'weekly', label: 'Weekly limit', percentUsed: 44, resetLabel: 'Mon 9:00 AM' }
      ]
    },
    {
      providerId: 'gemini',
      status: 'ok',
      lastSyncedAt: now,
      metrics: [{ id: 'session', label: 'Current session', percentUsed: 52, resetLabel: 'in 2 hr 10 min' },
        { id: 'weekly', label: 'Weekly limit', percentUsed: 18, resetLabel: 'Sun 12:00 AM' }]
    }
  ]
  let settings: AppSettings = {
    schemaVersion: 2,
    refreshIntervalMinutes: 10,
    enabledProviders: { claude: true, codex: true, gemini: true },
    edge: 'right',
    verticalOffset: 120,
    launchAtLogin: false,
    theme: 'auto'
  }
  const noop = async (): Promise<void> => undefined

  window.buddyUsage = {
    listProviders: async () => providers,
    getAllUsage: async () => snapshots,
    refreshUsage: noop,
    openLogin: async () => true,
    openDashboard: noop,
    getSettings: async () => settings,
    updateSettings: async (patch) => (settings = { ...settings, ...patch }),
    setIgnoreMouse: noop,
    showContextMenu: noop,
    openSettings: noop,
    quit: noop,
    onUsageUpdated: () => () => undefined,
    onSettingsUpdated: () => () => undefined
  }
}
