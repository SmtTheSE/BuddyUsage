import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  MAX_REFRESH_INTERVAL_MINUTES,
  MIN_REFRESH_INTERVAL_MINUTES,
  type ScreenEdge,
  type ThemeMode
} from '@shared/types'
import { useAppStore } from '../state/store'
import { ProviderIcon } from './ProviderIcon'
import { Switch } from './Switch'
import { relativeSyncLabel } from '../lib/usageColor'
import { UpdateBanner } from './UpdateBanner'

const INTERVAL_OPTIONS = [1, 2, 3, 5, 10, 15, 30, 60].filter(
  (m) => m >= MIN_REFRESH_INTERVAL_MINUTES && m <= MAX_REFRESH_INTERVAL_MINUTES
)

const SECTION_SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}): JSX.Element {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'segmented__item segmented__item--on' : 'segmented__item'}
          onClick={() => onChange(option.value)}
        >
          {value === option.value && (
            <motion.span layoutId="segmented-pill" className="segmented__pill" transition={SECTION_SPRING} />
          )}
          <span className="segmented__label">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function SettingsView(): JSX.Element | null {
  const { settings, providers, usageByProvider, syncing, updateSettings, openLogin, refresh } = useAppStore()
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
      <header className="settings__header">
        <h1 className="settings__title">BuddyUsage</h1>
        <p className="settings__subtitle">Your AI assistants, at a glance.</p>
      </header>

      <motion.section
        className="card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SECTION_SPRING, delay: 0.02 }}
      >
        <h2 className="card__title">Providers</h2>
        {providers.map((provider) => {
          const snapshot = usageByProvider[provider.id]
          const enabled = settings.enabledProviders[provider.id] !== false
          const status =
            snapshot?.status === 'logged_out'
              ? 'Not signed in'
              : snapshot?.status === 'no_meter'
                ? `${snapshot.planLabel ?? 'Free'} plan · no meter`
                : snapshot?.status === 'error'
                  ? 'Needs attention'
                : syncing[provider.id]
                  ? 'Updating…'
                  : relativeSyncLabel(snapshot?.lastSyncedAt)
          return (
            <div key={provider.id} className={enabled ? 'row row--provider' : 'row row--provider row--muted'}>
              <span className="row__icon">
                <ProviderIcon providerId={provider.id} name={provider.name} size={18} />
              </span>
              <span className="row__main">
                <span className="row__label">{provider.name}</span>
                <span className="row__hint">{status}</span>
              </span>
              <span className="row__actions">
                {snapshot?.status === 'logged_out' ? (
                  <button
                    className="button button--small button--tinted"
                    disabled={busy !== null}
                    onClick={() => void withBusy(`login:${provider.id}`, () => openLogin(provider.id))}
                  >
                    {busy === `login:${provider.id}` ? 'Waiting…' : 'Sign in'}
                  </button>
                ) : (
                  <button
                    className="button button--small"
                    disabled={busy !== null || syncing[provider.id] === true}
                    onClick={() => void withBusy(`refresh:${provider.id}`, () => refresh(provider.id))}
                  >
                    Refresh
                  </button>
                )}
                <Switch
                  checked={enabled}
                  label={`Show ${provider.name}`}
                  onChange={(next) =>
                    void updateSettings({
                      enabledProviders: { ...settings.enabledProviders, [provider.id]: next }
                    })
                  }
                />
              </span>
            </div>
          )
        })}
      </motion.section>

      <motion.section
        className="card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SECTION_SPRING, delay: 0.06 }}
      >
        <h2 className="card__title">Sync</h2>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Refresh every</span>
            <span className="row__hint">
              Also re-syncs when you use a tool, when a limit resets, after sleep, and when you open a card.
            </span>
          </span>
          <select
            className="select"
            value={settings.refreshIntervalMinutes}
            onChange={(e) => void updateSettings({ refreshIntervalMinutes: Number(e.target.value) })}
          >
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Launch at login</span>
          </span>
          <Switch
            checked={settings.launchAtLogin}
            label="Launch at login"
            onChange={(next) => void updateSettings({ launchAtLogin: next })}
          />
        </div>
      </motion.section>

      <motion.section
        className="card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SECTION_SPRING, delay: 0.1 }}
      >
        <h2 className="card__title">Island</h2>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Screen edge</span>
          </span>
          <Segmented<ScreenEdge>
            value={settings.edge}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' }
            ]}
            onChange={(edge) => void updateSettings({ edge })}
          />
        </div>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Collapsed</span>
            <span className="row__hint">Slim tab with status dots — hover to peek.</span>
          </span>
          <Switch
            checked={settings.islandCollapsed}
            label="Collapse island"
            onChange={(next) => void updateSettings({ islandCollapsed: next })}
          />
        </div>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Distance from top</span>
            <span className="row__hint">Or just drag the island — it snaps to the nearest edge of any screen.</span>
          </span>
          <span className="row__control">
            <input
              type="range"
              min={0}
              max={800}
              step={10}
              value={settings.verticalOffset}
              onChange={(e) => void updateSettings({ verticalOffset: Number(e.target.value) })}
            />
            <span className="row__value">{settings.verticalOffset}px</span>
          </span>
        </div>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Appearance</span>
          </span>
          <Segmented<ThemeMode>
            value={settings.theme}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
            onChange={(theme) => void updateSettings({ theme })}
          />
        </div>
      </motion.section>

      <motion.section
        className="card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SECTION_SPRING, delay: 0.14 }}
      >
        <h2 className="card__title">Updates</h2>
        <UpdateBanner />
        <p className="row__hint" style={{ padding: '0 0 8px' }}>
          Checked automatically every few hours. Updates install in place and restart the app.
        </p>
      </motion.section>

      <footer className="settings__footer">
        <button className="link" onClick={() => void window.buddyUsage.quit()}>
          Quit BuddyUsage
        </button>
      </footer>
    </div>
  )
}
