import { useState } from 'react'
import {
  MAX_REFRESH_INTERVAL_MINUTES,
  MIN_REFRESH_INTERVAL_MINUTES,
  type ScreenEdge
} from '@shared/types'
import { useAppStore } from '../state/store'
import { ProviderIcon } from './ProviderIcon'
import { relativeSyncLabel } from '../lib/usageColor'

const INTERVAL_OPTIONS = [5, 10, 15, 30, 60].filter(
  (m) => m >= MIN_REFRESH_INTERVAL_MINUTES && m <= MAX_REFRESH_INTERVAL_MINUTES
)

export function SettingsView(): JSX.Element | null {
  const { settings, providers, usageByProvider, updateSettings, openLogin, refresh } = useAppStore()
  const [busy, setBusy] = useState<string | null>(null)
  if (!settings) return null

  async function withBusy(key: string, action: () => Promise<unknown>): Promise<void> {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="settings">
      <h1 className="settings__title">BuddyUsage</h1>

      <section className="settings__section">
        <h2>Providers</h2>
        {providers.map((provider) => {
          const snapshot = usageByProvider[provider.id]
          const enabled = settings.enabledProviders[provider.id] !== false
          return (
            <div key={provider.id} className="provider-row">
              <label className="provider-row__main">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    void updateSettings({
                      enabledProviders: { ...settings.enabledProviders, [provider.id]: e.target.checked }
                    })
                  }
                />
                <ProviderIcon providerId={provider.id} name={provider.name} size={16} />
                <span>{provider.name}</span>
                <span className="provider-row__status">
                  {snapshot?.status === 'logged_out'
                    ? 'Not signed in'
                    : snapshot?.status === 'error'
                      ? 'Error'
                      : relativeSyncLabel(snapshot?.lastSyncedAt)}
                </span>
              </label>
              <div className="provider-row__actions">
                <button
                  className="button button--small"
                  disabled={busy !== null}
                  onClick={() => void withBusy(`login:${provider.id}`, () => openLogin(provider.id))}
                >
                  {busy === `login:${provider.id}` ? 'Waiting…' : 'Sign in'}
                </button>
                <button
                  className="button button--small"
                  disabled={busy !== null}
                  onClick={() => void withBusy(`refresh:${provider.id}`, () => refresh(provider.id))}
                >
                  {busy === `refresh:${provider.id}` ? '…' : 'Refresh'}
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <section className="settings__section">
        <h2>Behaviour</h2>
        <label className="settings-row">
          <span>Refresh every</span>
          <select
            value={settings.refreshIntervalMinutes}
            onChange={(e) => void updateSettings({ refreshIntervalMinutes: Number(e.target.value) })}
          >
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="settings-row">
          <span>Launch at login</span>
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => void updateSettings({ launchAtLogin: e.target.checked })}
          />
        </label>
      </section>

      <section className="settings__section">
        <h2>Island</h2>
        <label className="settings-row">
          <span>Screen edge</span>
          <select
            value={settings.edge}
            onChange={(e) => void updateSettings({ edge: e.target.value as ScreenEdge })}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <label className="settings-row">
          <span>Distance from top</span>
          <span className="settings-row__control">
            <input
              type="range"
              min={0}
              max={800}
              step={10}
              value={settings.verticalOffset}
              onChange={(e) => void updateSettings({ verticalOffset: Number(e.target.value) })}
            />
            <span className="settings-row__value">{settings.verticalOffset}px</span>
          </span>
        </label>
      </section>

      <section className="settings__section settings__section--footer">
        <button className="link" onClick={() => void window.buddyUsage.quit()}>
          Quit BuddyUsage
        </button>
      </section>
    </div>
  )
}
