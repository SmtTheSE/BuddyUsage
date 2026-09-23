import { create } from 'zustand'
import type {
  AgentSession,
  AgentsState,
  AppSettings,
  ProviderMeta,
  UpdateState,
  UsageForecast,
  UsageSnapshot
} from '@shared/types'

interface AppState {
  providers: ProviderMeta[]
  usageByProvider: Record<string, UsageSnapshot>
  settings: AppSettings | null
  syncing: Record<string, boolean>
  update: UpdateState | null
  agents: AgentsState
  forecasts: Record<string, UsageForecast>
  init: () => Promise<void>
  refresh: (providerId?: string) => Promise<void>
  openLogin: (providerId: string) => Promise<void>
  openDashboard: (providerId: string) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  providers: [],
  usageByProvider: {},
  settings: null,
  syncing: {},
  update: null,
  agents: { sessions: [], paused: [], scanAvailable: true },
  forecasts: {},

  init: async () => {
    const [providers, snapshots, settings, syncing, update, agents] = await Promise.all([
      window.buddyUsage.listProviders(),
      window.buddyUsage.getAllUsage(),
      window.buddyUsage.getSettings(),
      window.buddyUsage.getSyncState(),
      window.buddyUsage.getUpdateState(),
      window.buddyUsage.getAgents()
    ])
    set({
      providers,
      settings,
      syncing,
      update,
      agents,
      usageByProvider: Object.fromEntries(snapshots.map((s) => [s.providerId, s]))
    })
    window.buddyUsage.onAgentsUpdated((agents) => set({ agents }))
    // The pace is derived from polled history, so it only changes when a
    // snapshot does; refresh it alongside.
    const pullForecasts = (): void => void window.buddyUsage.getForecasts().then((forecasts) => set({ forecasts }))
    pullForecasts()
    window.buddyUsage.onUsageUpdated((snapshot) => {
      set((state) => ({
        usageByProvider: { ...state.usageByProvider, [snapshot.providerId]: snapshot }
      }))
      pullForecasts()
    })
    window.buddyUsage.onSettingsUpdated((next) => set({ settings: next }))
    window.buddyUsage.onSyncStateChanged(({ providerId, syncing }) =>
      set((state) => ({ syncing: { ...state.syncing, [providerId]: syncing } }))
    )
    window.buddyUsage.onUpdateState((update) => set({ update }))
  },

  refresh: async (providerId) => {
    await window.buddyUsage.refreshUsage(providerId)
  },

  openLogin: async (providerId) => {
    await window.buddyUsage.openLogin(providerId)
  },

  openDashboard: async (providerId) => {
    await window.buddyUsage.openDashboard(providerId)
  },

  updateSettings: async (patch) => {
    const next = await window.buddyUsage.updateSettings(patch)
    set({ settings: next })
  }
}))

/** Live sessions for one provider, attention first. */
export function selectSessions(agents: AgentsState, providerId: string): AgentSession[] {
  return agents.sessions
    .filter((s) => s.providerId === providerId)
    .sort((a, b) => Number(b.state === 'attention') - Number(a.state === 'attention'))
}

export function selectEnabledProviders(state: AppState): ProviderMeta[] {
  if (!state.settings) return state.providers
  return state.providers.filter((p) => state.settings!.enabledProviders[p.id] !== false)
}
