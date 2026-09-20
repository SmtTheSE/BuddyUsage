import { Notification } from 'electron'
import Store from 'electron-store'
import type { PausedSession, UsageSnapshot } from '@shared/types'
import { primaryMetric } from '@shared/types'
import { getSettings } from '../store/settings'
import { getSnapshot, onSnapshotUpdated } from '../store/usageStore'
import { getProvider } from '../providers/registry'
import { adapterFor } from './adapters'
import { getPaused, onAgentsChanged, sessionsFor, setPaused } from './agentMonitor'
import { resumeInTerminal, stopSession } from './agentControl'

/**
 * "Pause my agents when a limit passes N%." When a provider's primary
 * metric crosses the threshold, every running session of that provider
 * is interrupted (the same Ctrl-C the user would send), remembered, and
 * offered back after the reset. While the provider stays above the line,
 * any new session that appears is stopped too — the guard is a state,
 * not a one-off.
 */

const store = new Store<{ paused: PausedSession[] }>({ name: 'buddy-usage-guard', defaults: { paused: [] } })
const tripped = new Set<string>()
let installed = false

function guardApplies(providerId: string): boolean {
  const { limitGuard } = getSettings()
  if (!limitGuard.enabled) return false
  if (!adapterFor(providerId)) return false
  return limitGuard.providers[providerId] !== false
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const note = new Notification({ title, body })
  if (onClick) note.on('click', onClick)
  note.show()
}

async function pauseRunning(providerId: string, percent: number): Promise<number> {
  const running = sessionsFor(providerId).filter((s) => s.state !== 'stopping')
  if (running.length === 0) return 0
  const now = new Date().toISOString()
  const additions: PausedSession[] = running.map((s) => ({
    providerId,
    cwd: s.cwd,
    project: s.project,
    sessionId: s.sessionId,
    pausedAt: now,
    percentAtPause: percent
  }))
  await Promise.all(running.map((s) => stopSession(s.id, true)))
  persist([...getPaused(), ...additions])
  return running.length
}

function persist(list: PausedSession[]): void {
  store.set('paused', list)
  setPaused(list)
}

async function onSnapshot(snapshot: UsageSnapshot): Promise<void> {
  const providerId = snapshot.providerId
  const metric = primaryMetric(snapshot)
  if (!metric || (snapshot.status !== 'ok' && snapshot.status !== 'stale')) return
  const provider = getProvider(providerId)
  const name = provider?.name ?? providerId
  const { limitGuard } = getSettings()

  if (guardApplies(providerId) && metric.percentUsed >= limitGuard.percent) {
    const first = !tripped.has(providerId)
    tripped.add(providerId)
    const count = await pauseRunning(providerId, metric.percentUsed)
    if (count > 0 || first) {
      const when = metric.resetLabel ? ` Resets ${metric.resetLabel}.` : ''
      notify(
        count > 0 ? `Paused ${count} ${name} session${count === 1 ? '' : 's'}` : `${name} limit guard is on`,
        count > 0 ? `${name} is at ${metric.percentUsed}%.${when} They can be resumed after the reset.` : `${name} is at ${metric.percentUsed}%; new sessions will be stopped.${when}`
      )
    }
    return
  }

  if (tripped.has(providerId) && metric.percentUsed < limitGuard.percent) {
    tripped.delete(providerId)
    const mine = getPaused().filter((p) => p.providerId === providerId)
    if (mine.length > 0) {
      notify(`${name} reset — resume ${mine.length} paused session${mine.length === 1 ? '' : 's'}?`, 'Click to reopen them in a terminal.', () => {
        void resumePaused(providerId)
      })
    }
  }
}

/** Reopens every paused session of a provider (or all) in fresh terminals and clears them from the list. */
export async function resumePaused(providerId?: string): Promise<number> {
  const all = getPaused()
  const targets = providerId ? all.filter((p) => p.providerId === providerId) : all
  let opened = 0
  for (const p of targets) {
    if (await resumeInTerminal(p.providerId, p.cwd, p.sessionId)) opened++
  }
  persist(all.filter((p) => !targets.includes(p)))
  return opened
}

export function dismissPaused(providerId?: string): void {
  persist(providerId ? getPaused().filter((p) => p.providerId !== providerId) : [])
}

export function isTripped(providerId: string): boolean {
  return tripped.has(providerId)
}

export function startLimitGuard(): PausedSession[] {
  const paused = store.get('paused') ?? []
  if (installed) return paused
  installed = true
  onSnapshotUpdated((snapshot) => void onSnapshot(snapshot))
  // A session that starts while the provider is over the line is stopped as soon as the scan sees it.
  onAgentsChanged((state) => {
    for (const providerId of tripped) {
      if (!guardApplies(providerId)) continue
      const fresh = state.sessions.filter((s) => s.providerId === providerId && s.pid && s.state === 'running')
      if (fresh.length === 0) continue
      const percent = primaryMetric(getSnapshot(providerId))?.percentUsed ?? getSettings().limitGuard.percent
      void pauseRunning(providerId, percent).then((n) => {
        if (n > 0) notify(`Stopped a new ${getProvider(providerId)?.name ?? providerId} session`, 'The limit guard is active until the reset.')
      })
    }
  })
  return paused
}

/** Settings changed: forget trips for providers the guard no longer covers. */
export function reconcileLimitGuard(): void {
  for (const providerId of [...tripped]) if (!guardApplies(providerId)) tripped.delete(providerId)
}
