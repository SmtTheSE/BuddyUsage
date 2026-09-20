import { BrowserWindow } from 'electron'
import type { ProviderMeta, RemoteInfo } from '@shared/types'
import { IpcChannel } from '@shared/types'
import { providerRegistry } from '../providers/registry'
import { getAllSnapshots } from '../store/usageStore'
import { getSettings, updateSettings } from '../store/settings'
import { refreshProviderNow } from '../scraping/scheduler'
import { adoptLoginShellPath } from './shellPath'
import { getAgentsState, onAgentsChanged, startAgentMonitor, stopAgentMonitor } from './agentMonitor'
import { reconcileLimitGuard, startLimitGuard } from './limitGuard'
import { getServerPort, remoteInfo, startLocalServer, stopLocalServer } from './localServer'
import { repointInstalledHooks } from './hooks'
import { randomBytes } from 'crypto'
import { adapterFor } from './adapters'

/** ProviderMeta as the renderer and the phone page see it. */
export function providerMetas(): ProviderMeta[] {
  return providerRegistry.map((p) => ({ id: p.id, name: p.name, color: p.color, usageUrl: p.usageUrl, agent: !!adapterFor(p.id) }))
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

const serverDeps = {
  token: () => getSettings().remoteToken,
  remoteEnabled: () => getSettings().remoteEnabled,
  alertsEnabled: () => getSettings().agentAlerts,
  providers: providerMetas,
  usage: getAllSnapshots,
  refresh: () => refreshProviderNow()
}

export async function startAgents(): Promise<void> {
  await adoptLoginShellPath()
  const paused = startLimitGuard()
  startAgentMonitor(paused)
  onAgentsChanged((state) => broadcast(IpcChannel.AgentsUpdated, state))
  try {
    const port = await startLocalServer(serverDeps)
    await repointInstalledHooks({ port, token: getSettings().remoteToken })
  } catch (error) {
    console.error('[agents] listener failed to start:', error)
  }
}

export async function stopAgents(): Promise<void> {
  stopAgentMonitor()
  await stopLocalServer()
}

/** Remote toggled or token changed: rebind the listener and re-point hooks. */
export async function applyAgentSettings(): Promise<void> {
  reconcileLimitGuard()
  try {
    const port = await startLocalServer(serverDeps)
    await repointInstalledHooks({ port, token: getSettings().remoteToken })
  } catch (error) {
    console.error('[agents] listener failed to restart:', error)
  }
}

export function hookTarget(): { port: number; token: string } {
  return { port: getServerPort(), token: getSettings().remoteToken }
}

export async function currentRemoteInfo(): Promise<RemoteInfo> {
  const settings = getSettings()
  return remoteInfo(settings.remoteToken, settings.remoteEnabled)
}

/** New secret: old phone links and hook URLs stop working; installed hooks are re-pointed. */
export async function regenerateRemoteToken(): Promise<RemoteInfo> {
  updateSettings({ remoteToken: randomBytes(16).toString('hex') })
  await applyAgentSettings()
  return currentRemoteInfo()
}

export { getAgentsState }
