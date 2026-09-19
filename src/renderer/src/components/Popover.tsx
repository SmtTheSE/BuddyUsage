import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ProviderMeta, ScreenEdge, UsageSnapshot } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'
import { formatUntil, hasReadings, relativeSyncLabel, usageColor } from '../lib/usageColor'
import { useAppStore } from '../state/store'
import { UpdateBanner } from './UpdateBanner'

interface PopoverProps {
  provider: ProviderMeta
  snapshot?: UsageSnapshot
  edge: ScreenEdge
  pinned?: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

// Opening the popover on data older than this quietly re-syncs it, so what
// the user is looking at is current without them touching anything.
const STALE_ON_OPEN_MS = 45_000
const SYNC_LABEL_TICK_MS = 10_000

/** The detail card that appears beside a ring on hover. */
export function Popover({ provider, snapshot, edge, pinned = false, onMouseEnter, onMouseLeave }: PopoverProps): JSX.Element {
  const { refresh, openLogin, openDashboard } = useAppStore()
  const syncing = useAppStore((s) => s.syncing[provider.id] === true)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const status = snapshot?.status ?? 'loading'

  useEffect(() => {
    const age = snapshot?.lastSyncedAt ? Date.now() - new Date(snapshot.lastSyncedAt).getTime() : Infinity
    if (!syncing && age > STALE_ON_OPEN_MS && status !== 'logged_out') void refresh(provider.id)
    // Keep "Synced Xs ago" honest while the card stays open.
    const timer = setInterval(() => tick((n) => n + 1), SYNC_LABEL_TICK_MS)
    return () => clearInterval(timer)
    // Only on open: re-running on every snapshot change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id])

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className={`popover popover--${edge}`}
      data-solid
      initial={{ opacity: 0, x: edge === 'right' ? 14 : -14, scale: 0.96, filter: 'blur(6px)' }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: edge === 'right' ? 10 : -10, scale: 0.97, filter: 'blur(4px)' }}
      // Springs overshoot; blur can't go negative, so it tweens.
      transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8, filter: { type: 'tween', duration: 0.18 } }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="popover__header">
        <ProviderIcon providerId={provider.id} name={provider.name} size={18} />
        <span>{provider.name} Usage</span>
        {snapshot?.planLabel && <span className="popover__plan">{snapshot.planLabel}</span>}
        {pinned && (
          <span className="popover__pin" title="Pinned — click the ring again to unpin" aria-label="Pinned">
            ⌖
          </span>
        )}
      </div>

      {hasReadings(snapshot) &&
        snapshot!.metrics.map((metric) => (
          <div key={metric.id} className="metric">
            <div className="metric__row">
              <span className="metric__label">{metric.label}</span>
              {(metric.resetsAt || metric.resetLabel) && (
                <span
                  className="metric__reset"
                  title={metric.resetsAt ? new Date(metric.resetsAt).toLocaleString() : undefined}
                >
                  Resets {formatUntil(metric.resetsAt) ?? metric.resetLabel}
                </span>
              )}
            </div>
            <div className="metric__track">
              <motion.div
                className="metric__fill"
                style={{ background: usageColor(metric.percentUsed), ['--bar-color' as string]: usageColor(metric.percentUsed) }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, metric.percentUsed))}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <div className="metric__value">
              {metric.percentUsed}% Used
              {metric.used !== undefined && metric.limit !== undefined && (
                <span className="metric__detail">
                  {' '}
                  ·{' '}
                  {metric.unit && /^[$€£]$/.test(metric.unit)
                    ? `${metric.unit}${metric.used.toFixed(2)} / ${metric.unit}${metric.limit.toFixed(2)}`
                    : `${metric.used} / ${metric.limit} ${metric.unit ?? ''}`}
                </span>
              )}
            </div>
          </div>
        ))}

      {status === 'logged_out' && (
        <div className="popover__state">
          <p>Sign in to see usage.</p>
          <button className="button" disabled={busy} onClick={() => void run(() => openLogin(provider.id))}>
            Sign in
          </button>
        </div>
      )}

      {status === 'no_meter' && (
        <div className="popover__state popover__state--column">
          <p>{snapshot?.message}</p>
          <button className="button button--small button--tinted" onClick={() => void openDashboard(provider.id)}>
            See plans ↗
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="popover__state">
          <p className="popover__error">{snapshot?.message ?? 'Could not load usage.'}</p>
          <button className="button" disabled={busy || syncing} onClick={() => void run(() => refresh(provider.id))}>
            Retry
          </button>
        </div>
      )}

      {status === 'loading' && !syncing && (
        <div className="popover__state">
          <p>Waiting for first sync…</p>
        </div>
      )}

      <UpdateBanner compact />

      <div className="popover__footer">
        <span
          className={
            syncing
              ? 'popover__sync popover__sync--live'
              : status === 'stale'
                ? 'popover__sync popover__sync--stale'
                : 'popover__sync'
          }
        >
          {syncing ? (
            <>
              <span className="sync-dot" aria-hidden="true" /> Updating…
            </>
          ) : (
            <>
              {status === 'stale' ? 'Stale · ' : ''}
              {relativeSyncLabel(snapshot?.lastSyncedAt)}
            </>
          )}
        </span>
        <span className="popover__actions">
          <button
            className="link"
            disabled={busy || syncing}
            onClick={() => void run(() => refresh(provider.id))}
            aria-label={`Refresh ${provider.name}`}
          >
            Refresh
          </button>
          <button className="link" onClick={() => void openDashboard(provider.id)}>
            Open ↗
          </button>
        </span>
      </div>
    </motion.div>
  )
}
