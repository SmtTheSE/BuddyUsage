import { BrowserWindow } from 'electron'
import { IpcChannel, type ActivityReport, type UsageForecast } from '@shared/types'
import { getAllSnapshots, onSnapshotUpdated } from '../store/usageStore'
import { getProvider } from '../providers/registry'
import { activityReport, isScanning, onActivityChanged, scanActivity } from './activity'
import { forecastFor, recordSnapshot } from './history'
import { handleSnapshotForAlerts } from './alerts'
import { handleSnapshotForDigest } from './digest'

/**
 * Wires the local-insight pieces (activity scan, pace history, alerts) to
 * the app's existing snapshot stream. Everything here is derived from data
 * already on the machine.
 */

// The transcripts only change while a CLI is running; a few minutes is
// plenty, and the scan is incremental (offsets are remembered).
const SCAN_INTERVAL_MS = 5 * 60 * 1000
let scanTimer: NodeJS.Timeout | undefined
let installed = false

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function startInsights(): void {
  if (installed) return
  installed = true
  onSnapshotUpdated((snapshot) => {
    recordSnapshot(snapshot)
    handleSnapshotForAlerts(snapshot)
    handleSnapshotForDigest(snapshot)
  })
  onActivityChanged(() => broadcast(IpcChannel.ActivityUpdated, isScanning()))
  void scanActivity()
  scanTimer = setInterval(() => void scanActivity(), SCAN_INTERVAL_MS)
}

export function stopInsights(): void {
  if (scanTimer) clearInterval(scanTimer)
}

export function getActivity(rangeDays: number): ActivityReport {
  const report = activityReport(Math.max(1, Math.min(30, Math.round(rangeDays))))
  // The scanner works in provider ids; the view shows names.
  return {
    ...report,
    byProvider: report.byProvider.map((row) => ({ ...row, label: getProvider(row.label)?.name ?? row.label }))
  }
}

export async function rescanActivity(rangeDays: number): Promise<ActivityReport> {
  await scanActivity()
  return getActivity(rangeDays)
}

/** Forecast per provider, for the cards. */
export function allForecasts(): Record<string, UsageForecast> {
  const out: Record<string, UsageForecast> = {}
  for (const snapshot of getAllSnapshots()) {
    const projection = forecastFor(snapshot)
    if (projection) out[snapshot.providerId] = projection
  }
  return out
}
