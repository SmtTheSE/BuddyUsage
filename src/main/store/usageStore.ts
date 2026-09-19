import Store from 'electron-store'
import type { ProviderId, UsageSnapshot } from '@shared/types'

const CURRENT_SCHEMA_VERSION = 3

interface UsageCacheShape {
  schemaVersion: number
  snapshots: Record<ProviderId, UsageSnapshot>
}

const store = new Store<UsageCacheShape>({
  name: 'buddy-usage-cache',
  defaults: { schemaVersion: CURRENT_SCHEMA_VERSION, snapshots: {} }
})

// The cache is a pure convenience (instant last-known values on launch);
// on a schema change it's cheaper and safer to start empty than to migrate.
if (store.get('schemaVersion') !== CURRENT_SCHEMA_VERSION) {
  store.set('snapshots', {})
  store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
}

type Listener = (snapshot: UsageSnapshot) => void
const listeners = new Set<Listener>()

/** Renderer windows subscribe here (via ipc.ts) to get push updates without polling. */
export function onSnapshotUpdated(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAllSnapshots(): UsageSnapshot[] {
  return Object.values(store.get('snapshots'))
}

export function getSnapshot(providerId: ProviderId): UsageSnapshot | undefined {
  return store.get('snapshots')[providerId]
}

export function setSnapshot(snapshot: UsageSnapshot): void {
  const snapshots = store.get('snapshots')
  snapshots[snapshot.providerId] = snapshot
  store.set('snapshots', snapshots)
  for (const listener of listeners) listener(snapshot)
}

/** Where the cache lives on disk — the CLI reads this same file. */
export function getUsageCachePath(): string {
  return store.path
}
