import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ProviderMeta, ScreenEdge, UsageSnapshot } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'
import { hasReadings, relativeSyncLabel, usageColor } from '../lib/usageColor'
import { useAppStore } from '../state/store'

interface PopoverProps {
  provider: ProviderMeta
  snapshot?: UsageSnapshot
  edge: ScreenEdge
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/** The detail card that appears beside a ring on hover. */
export function Popover({ provider, snapshot, edge, onMouseEnter, onMouseLeave }: PopoverProps): JSX.Element {
  const { refresh, openLogin, openDashboard } = useAppStore()
  const [busy, setBusy] = useState(false)
  const status = snapshot?.status ?? 'loading'

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
      initial={{ opacity: 0, x: edge === 'right' ? 8 : -8, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: edge === 'right' ? 6 : -6, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="popover__header">
        <ProviderIcon providerId={provider.id} name={provider.name} size={18} />
        <span>{provider.name} Usage</span>
        {snapshot?.planLabel && <span className="popover__plan">{snapshot.planLabel}</span>}
      </div>

      {hasReadings(snapshot) &&
        snapshot!.metrics.map((metric) => (
          <div key={metric.id} className="metric">
            <div className="metric__row">
              <span className="metric__label">{metric.label}</span>
              {metric.resetLabel && <span className="metric__reset">Resets {metric.resetLabel}</span>}
            </div>
            <div className="metric__track">
              <motion.div
                className="metric__fill"
                style={{ background: usageColor(metric.percentUsed) }}
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
                  · {metric.used} / {metric.limit} {metric.unit ?? ''}
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

      {status === 'error' && (
        <div className="popover__state">
          <p className="popover__error">{snapshot?.message ?? 'Could not load usage.'}</p>
          <button className="button" disabled={busy} onClick={() => void run(() => refresh(provider.id))}>
            Retry
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="popover__state">
          <p>Loading…</p>
        </div>
      )}

      <div className="popover__footer">
        <span className={status === 'stale' ? 'popover__sync popover__sync--stale' : 'popover__sync'}>
          {status === 'stale' ? 'Stale · ' : ''}
          {relativeSyncLabel(snapshot?.lastSyncedAt)}
        </span>
        <span className="popover__actions">
          <button
            className="link"
            disabled={busy}
            onClick={() => void run(() => refresh(provider.id))}
            aria-label={`Refresh ${provider.name}`}
          >
            {busy ? '…' : 'Refresh'}
          </button>
          <button className="link" onClick={() => void openDashboard(provider.id)}>
            Open ↗
          </button>
        </span>
      </div>
    </motion.div>
  )
}
