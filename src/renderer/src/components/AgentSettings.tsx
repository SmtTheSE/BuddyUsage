import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { HookStatus, RemoteInfo } from '@shared/types'
import { useAppStore } from '../state/store'
import { ProviderIcon } from './ProviderIcon'
import { Switch } from './Switch'

const SECTION_SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const
const GUARD_OPTIONS = [80, 90, 95, 100]

/** Settings cards for the agent features: limit guard, alerts (hooks), phone remote. */
export function AgentSettings(): JSX.Element | null {
  const { settings, providers, updateSettings, agents } = useAppStore()
  const [hooks, setHooks] = useState<HookStatus[]>([])
  const [remote, setRemote] = useState<RemoteInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const agentProviders = providers.filter((p) => p.agent)

  useEffect(() => {
    void window.buddyUsage.getHookStatuses().then(setHooks)
  }, [])
  useEffect(() => {
    void window.buddyUsage.getRemoteInfo().then(setRemote)
  }, [settings?.remoteEnabled, settings?.remoteToken])

  if (!settings) return null
  const guard = settings.limitGuard

  async function withBusy(key: string, action: () => Promise<unknown>): Promise<void> {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  async function toggleHooks(providerId: string, status: HookStatus | undefined): Promise<void> {
    await withBusy(`hook:${providerId}`, async () => {
      const next =
        status?.status === 'installed'
          ? await window.buddyUsage.uninstallHooks(providerId)
          : await window.buddyUsage.installHooks(providerId)
      setHooks((list) => [...list.filter((h) => h.providerId !== providerId), next])
    })
  }

  function hookLabel(status: HookStatus | undefined): string {
    switch (status?.status) {
      case 'installed':
        return 'Installed'
      case 'conflict':
        return 'Replace'
      case 'unsupported':
        return 'n/a'
      default:
        return 'Install'
    }
  }

  return (
    <>
      <motion.section className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SECTION_SPRING, delay: 0.1 }}>
        <h2 className="card__title">Agents</h2>
        <p className="row__hint" style={{ padding: '0 0 10px' }}>
          BuddyUsage watches the claude, codex and gemini sessions running on this computer
          {agents.scanAvailable ? '' : ' (process scanning is unavailable here; only hook events are shown)'}.
          Each card shows its sessions with Stop and a nudge box.
        </p>

        <div className="row">
          <span className="row__main">
            <span className="row__label">Limit guard</span>
            <span className="row__hint">Stop running sessions when a provider's main limit passes the line, and offer to resume them after the reset.</span>
          </span>
          <Switch checked={guard.enabled} label="Limit guard" onChange={(enabled) => void updateSettings({ limitGuard: { ...guard, enabled } })} />
        </div>
        {guard.enabled && (
          <>
            <div className="row">
              <span className="row__main">
                <span className="row__label">Pause at</span>
              </span>
              <div className="segmented" role="radiogroup">
                {GUARD_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={guard.percent === p}
                    className={guard.percent === p ? 'segmented__item segmented__item--on' : 'segmented__item'}
                    onClick={() => void updateSettings({ limitGuard: { ...guard, percent: p } })}
                  >
                    {guard.percent === p && <motion.span layoutId="guard-pill" className="segmented__pill" transition={SECTION_SPRING} />}
                    <span className="segmented__label">{p}%</span>
                  </button>
                ))}
              </div>
            </div>
            {agentProviders.map((p) => (
              <div className="row" key={p.id}>
                <span className="row__main">
                  <span className="row__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProviderIcon providerId={p.id} name={p.name} size={16} /> {p.name}
                  </span>
                </span>
                <Switch
                  checked={guard.providers[p.id] !== false}
                  label={`Guard ${p.name}`}
                  onChange={(on) => void updateSettings({ limitGuard: { ...guard, providers: { ...guard.providers, [p.id]: on } } })}
                />
              </div>
            ))}
          </>
        )}
      </motion.section>

      <motion.section className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SECTION_SPRING, delay: 0.12 }}>
        <h2 className="card__title">Waiting-for-you alerts</h2>
        <p className="row__hint" style={{ padding: '0 0 10px' }}>
          Each CLI can call BuddyUsage the moment it needs a permission click, goes idle or finishes. Installing adds a hook to that
          tool's own settings file; nothing else there is touched, and Remove puts it back.
        </p>
        <div className="row">
          <span className="row__main">
            <span className="row__label">System notifications</span>
            <span className="row__hint">Click one to jump to that terminal.</span>
          </span>
          <Switch checked={settings.agentAlerts} label="Agent alerts" onChange={(agentAlerts) => void updateSettings({ agentAlerts })} />
        </div>
        {agentProviders.map((p) => {
          const status = hooks.find((h) => h.providerId === p.id)
          return (
            <div className="row" key={p.id}>
              <span className="row__main">
                <span className="row__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProviderIcon providerId={p.id} name={p.name} size={16} /> {p.name}
                </span>
                {status?.status === 'conflict' && <span className="row__hint">{status.detail}</span>}
                {status?.status === 'installed' && <span className="row__hint">Hook active · {status.detail}</span>}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                {status?.status === 'installed' && (
                  <button className="link" disabled={busy === `hook:${p.id}`} onClick={() => void toggleHooks(p.id, status)}>
                    Remove
                  </button>
                )}
                {status?.status !== 'installed' && (
                  <button
                    className="button button--small button--tinted"
                    disabled={busy === `hook:${p.id}` || status?.status === 'unsupported'}
                    onClick={() => void withBusy(`hook:${p.id}`, async () => {
                      const next = await window.buddyUsage.installHooks(p.id)
                      setHooks((list) => [...list.filter((h) => h.providerId !== p.id), next])
                    })}
                  >
                    {busy === `hook:${p.id}` ? '…' : hookLabel(status)}
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </motion.section>

      <motion.section className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SECTION_SPRING, delay: 0.14 }}>
        <h2 className="card__title">Phone remote</h2>
        <div className="row">
          <span className="row__main">
            <span className="row__label">Serve on this Wi‑Fi</span>
            <span className="row__hint">
              Open the page on your phone to see the rings, stop an agent or send a nudge. Same network only; the link carries a secret.
            </span>
          </span>
          <Switch checked={settings.remoteEnabled} label="Phone remote" onChange={(remoteEnabled) => void updateSettings({ remoteEnabled })} />
        </div>
        {settings.remoteEnabled && remote && (
          <div className="remote">
            {remote.qrSvg ? (
              <div className="remote__qr" dangerouslySetInnerHTML={{ __html: remote.qrSvg }} />
            ) : (
              <p className="row__hint">No network address found. Connect to Wi‑Fi and try again.</p>
            )}
            {remote.url && (
              <div className="remote__url">
                <code>{remote.url}</code>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="link"
                    onClick={() => {
                      void navigator.clipboard.writeText(remote.url!)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    className="link"
                    disabled={busy === 'regen'}
                    title="Old links stop working"
                    onClick={() => void withBusy('regen', async () => setRemote(await window.buddyUsage.regenerateRemote()))}
                  >
                    New secret
                  </button>
                </span>
              </div>
            )}
            <p className="row__hint">
              Works from anywhere if this computer is on Tailscale or a similar VPN: use its VPN address with port {remote.port}.
            </p>
          </div>
        )}
      </motion.section>
    </>
  )
}
