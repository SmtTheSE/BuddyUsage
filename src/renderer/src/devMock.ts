import type { AppSettings, ProviderMeta, UsageSnapshot } from '@shared/types'

/**
 * Lets the renderer run in a plain browser tab (`npm run dev` then open
 * http://localhost:5173/#island) for fast UI iteration. Only installed when
 * the preload bridge is absent, i.e. never inside Electron.
 */
export function installDevMock(): void {
  const providers: ProviderMeta[] = [
    { id: 'claude', name: 'Claude', color: '#D97757', usageUrl: 'https://claude.ai/settings/usage', agent: true },
    { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', usageUrl: 'https://chatgpt.com/codex/settings/usage', agent: true },
    { id: 'gemini', name: 'Gemini', color: '#4285F4', usageUrl: 'https://gemini.google.com/app', agent: true },
    { id: 'cursor', name: 'Cursor', color: '#8B5CF6', usageUrl: 'https://cursor.com/dashboard?tab=usage' },
    { id: 'copilot', name: 'Copilot', color: '#6E7681', usageUrl: 'https://github.com/settings/billing/usage' }
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
      providerId: 'chatgpt',
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
    },
    {
      providerId: 'cursor',
      status: 'ok',
      planLabel: 'Pro',
      lastSyncedAt: now,
      metrics: [{ id: 'cursor-models', label: 'Cursor models', percentUsed: 62, used: 12.4, limit: 20, unit: '$', resetLabel: 'Oct 1' }]
    },
    {
      providerId: 'copilot',
      status: 'ok',
      lastSyncedAt: now,
      metrics: [{ id: 'credits', label: 'AI credits', percentUsed: 30, used: 4.5, limit: 15, unit: '$', resetLabel: 'Oct 1' }]
    }
  ]
  // ?providers=claude,chatgpt,gemini limits the mock to a subset (used for screenshots).
  const params = new URLSearchParams(window.location.search)
  const only = params.get('providers')?.split(',').filter(Boolean)
  const enabled = Object.fromEntries(providers.map((p) => [p.id, !only || only.includes(p.id)]))
  const quiet = params.get('quiet') === '1'
  const theme = (params.get('theme') as AppSettings['theme'] | null) ?? 'auto'

  let settings: AppSettings = {
    schemaVersion: 2,
    refreshIntervalMinutes: 10,
    enabledProviders: enabled,
    edge: 'right',
    verticalOffset: 120,
    islandCollapsed: false,
    menuBarUsage: false,
    onboardingSeen: true,
    launchAtLogin: false,
    theme,
    limitGuard: { enabled: true, percent: 90, providers: {} },
    agentAlerts: true,
    remoteEnabled: false,
    remoteToken: 'devtoken'
  }
  const agents = {
    scanAvailable: true,
    paused: [],
    sessions: quiet
      ? []
      : [
          { id: 'claude:101', providerId: 'claude', pid: 101, cwd: '/Users/dev/web-app', project: 'web-app', startedAt: new Date(Date.now() - 42 * 60000).toISOString(), hostApp: '/Applications/iTerm.app', state: 'running' as const },
          { id: 'claude:102', providerId: 'claude', pid: 102, cwd: '/Users/dev/infra', project: 'infra', startedAt: new Date(Date.now() - 5 * 60000).toISOString(), hostApp: '/Applications/iTerm.app', state: 'attention' as const, attention: { kind: 'permission' as const, message: 'Claude needs your permission to use Bash', at: new Date().toISOString() } }
        ]
  }
  const noop = async (): Promise<void> => undefined

  window.buddyUsage = {
    listProviders: async () => providers,
    getAllUsage: async () => snapshots,
    getSyncState: async () => ({}),
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
    onSettingsUpdated: () => () => undefined,
    onSyncStateChanged: () => () => undefined,
    setFocusable: noop,
    getAgents: async () => agents,
    onAgentsUpdated: () => () => undefined,
    stopAgent: async () => true,
    focusAgent: async () => true,
    nudgeAgent: async (providerId, text) => ({ providerId, ok: true, reply: `(mock) Got it: "${text}". I'll stop after this file.`, command: 'claude -p --resume … "…"' }),
    resumePaused: async () => 0,
    resumeCommand: async () => 'claude --resume abc',
    dismissPaused: noop,
    getHookStatuses: async () => [
      { providerId: 'claude', status: 'installed' as const, detail: '~/.claude/settings.json' },
      { providerId: 'chatgpt', status: 'conflict' as const, detail: 'Codex allows one notify program and yours is already set.' },
      { providerId: 'gemini', status: 'not_installed' as const }
    ],
    installHooks: async (providerId) => ({ providerId, status: 'installed' as const }),
    uninstallHooks: async (providerId) => ({ providerId, status: 'not_installed' as const }),
    getRemoteInfo: async () => ({ enabled: false, addresses: [], port: 47831 }),
    regenerateRemote: async () => ({ enabled: false, addresses: [], port: 47831 }),
    getUpdateState: async () => ({
      status: quiet ? 'up_to_date' : 'available',
      currentVersion: '0.2.5',
      latestVersion: '0.3.0',
      releaseUrl: 'https://github.com/SmtTheSE/BuddyUsage/releases/latest',
      downloadUrl: 'https://example.invalid',
      downloadSize: 100_000_000
    }),
    checkForUpdates: async () => ({ status: 'up_to_date', currentVersion: '0.2.5', latestVersion: '0.2.5' }),
    installUpdate: async () => ({ status: 'downloading', currentVersion: '0.2.5', latestVersion: '0.3.0', progress: 42 }),
    openDownloadPage: noop,
    onUpdateState: () => () => undefined
  }
}
