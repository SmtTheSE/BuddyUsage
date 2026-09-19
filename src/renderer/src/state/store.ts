import { create } from 'zustand'
import type { AppSettings, ProviderMeta, UsageSnapshot } from '@shared/types'

interface AppState {
  providers: ProviderMeta[]
  usageByProvider: Record<string, UsageSnapshot>
  settings: AppSettings | null
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

  init: async () => {
    const [providers, snapshots, settings] = await Promise.all([
      window.buddyUsage.listProviders(),
      window.buddyUsage.getAllUsage(),
      window.buddyUsage.getSettings()
    ])
    set({
      providers,
      settings,
      usageByProvider: Object.fromEntries(snapshots.map((s) => [s.providerId, s]))
    })
    window.buddyUsage.onUsageUpdated((snapshot) => {
      set((state) => ({
        usageByProvider: { ...state.usageByProvider, [snapshot.providerId]: snapshot }
      }))
    })
    window.buddyUsage.onSettingsUpdated((next) => set({ settings: next }))
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
