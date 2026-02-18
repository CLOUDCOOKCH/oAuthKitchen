import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppSettings {
  clientId: string
  tenantId: string
  useLimitedScopes: boolean
  inactiveDaysThreshold: number
  credentialExpiryCriticalDays: number
}

interface SettingsState {
  settings: AppSettings
  isConfigured: boolean
  updateSettings: (partial: Partial<AppSettings>) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  clientId: '',
  tenantId: 'organizations',
  useLimitedScopes: false,
  inactiveDaysThreshold: 90,
  credentialExpiryCriticalDays: 7,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      isConfigured: false,
      updateSettings: (partial) => {
        const updated = { ...get().settings, ...partial }
        set({
          settings: updated,
          isConfigured: Boolean(updated.clientId && updated.tenantId),
        })
      },
      resetSettings: () =>
        set({ settings: DEFAULT_SETTINGS, isConfigured: false }),
    }),
    {
      name: 'oauthkitchen-settings',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isConfigured = Boolean(
            state.settings.clientId && state.settings.tenantId
          )
        }
      },
    }
  )
)
