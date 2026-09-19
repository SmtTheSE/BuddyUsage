import { create } from 'zustand'
import type { AppSettings, ProviderMeta, UpdateState, UsageSnapshot } from '@shared/types'

interface AppState {
  providers: ProviderMeta[]
  usageByProvider: Record<string, UsageSnapshot>
  settings: AppSettings | null
  syncing: Record<string, boolean>
  update: UpdateState | null
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

  init: async () => {
    const [providers, snapshots, settings, syncing, update] = await Promise.all([
      window.buddyUsage.listProviders(),
      window.buddyUsage.getAllUsage(),
      window.buddyUsage.getSettings(),
      window.buddyUsage.getSyncState(),
      window.buddyUsage.getUpdateState()
    ])
    set({
      providers,
      settings,
      syncing,
      update,
      usageByProvider: Object.fromEntries(snapshots.map((s) => [s.providerId, s]))
    })
    window.buddyUsage.onUsageUpdated((snapshot) => {
      set((state) => ({
        usageByProvider: { ...state.usageByProvider, [snapshot.providerId]: snapshot }
      }))
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

export function selectEnabledProviders(state: AppState): ProviderMeta[] {
  if (!state.settings) return state.providers
  return state.providers.filter((p) => state.settings!.enabledProviders[p.id] !== false)
}
