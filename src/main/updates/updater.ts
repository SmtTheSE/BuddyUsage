import { app, Notification, shell } from 'electron'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { createWriteStream } from 'fs'
import { chmod, mkdtemp, rm, rename, cp, stat } from 'fs/promises'
import { finished } from 'stream/promises'
import { once } from 'events'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { UpdateState } from '@shared/types'

/**
 * In-app updates without a code-signing certificate. electron-updater
 * refuses to install on macOS unless the app carries a Developer ID
 * signature, so this checks GitHub Releases directly and installs the way
 * the CLI installer does: download the build for this machine, swap it
 * into place, relaunch. Downloads go through Node (not Chromium), so the
 * new app carries no quarantine flag and opens without a Gatekeeper prompt.
 */

const REPO = 'SmtTheSE/BuddyUsage'
const APP = 'BuddyUsage'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 15_000

const execFileAsync = promisify(execFile)

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface Release {
  tag_name: string
  html_url: string
  body?: string
  assets: ReleaseAsset[]
}

let state: UpdateState = { status: 'idle', currentVersion: app.getVersion() }
let latestRelease: Release | null = null
let notifiedVersion: string | null = null
const listeners = new Set<(state: UpdateState) => void>()

export function onUpdateState(listener: (state: UpdateState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUpdateState(): UpdateState {
  return state
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch, currentVersion: app.getVersion() }
  for (const listener of listeners) listener(state)
}

function parseVersion(tag: string): number[] {
  return tag
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** The asset name electron-builder produces for this OS + CPU. */
export function assetNameFor(platform = process.platform, arch = process.arch): string {
  const cpu = arch === 'arm64' ? 'arm64' : 'x64'
  if (platform === 'darwin') return `${APP}-${cpu}.dmg`
  if (platform === 'win32') return `${APP}-${cpu}.exe`
  return `${APP}-${cpu === 'x64' ? 'x86_64' : 'arm64'}.AppImage`
}

export async function checkForUpdates(options: { notify?: boolean } = {}): Promise<UpdateState> {
  if (state.status === 'downloading' || state.status === 'installing') return state
  setState({ status: 'checking', error: undefined })
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${APP}/${app.getVersion()}` }
    })
    if (!response.ok) throw new Error(`GitHub responded ${response.status}`)
    const release = (await response.json()) as Release
    latestRelease = release

    const version = release.tag_name.replace(/^v/, '')
    const asset = release.assets.find((a) => a.name === assetNameFor())
    if (!isNewer(version, app.getVersion())) {
      setState({ status: 'up_to_date', latestVersion: version, releaseUrl: release.html_url, checkedAt: new Date().toISOString() })
      return state
    }

    setState({
      status: 'available',
      latestVersion: version,
      releaseUrl: release.html_url,
      downloadUrl: asset?.browser_download_url,
      downloadSize: asset?.size,
      notes: release.body?.slice(0, 2000),
      checkedAt: new Date().toISOString()
    })

    if (options.notify && notifiedVersion !== version && Notification.isSupported()) {
      notifiedVersion = version
      const note = new Notification({
        title: `${APP} ${version} is available`,
        body: 'Click to update — it only takes a moment.'
      })
      note.on('click', () => void installUpdate())
      note.show()
    }
    return state
  } catch (error) {
    setState({ status: 'error', error: error instanceof Error ? error.message : 'Update check failed' })
    return state
  }
}

async function download(url: string, dest: string, size?: number): Promise<void> {
  const response = await fetch(url, { headers: { 'User-Agent': `${APP}/${app.getVersion()}` } })
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)

  const out = createWriteStream(dest)
  const reader = response.body.getReader()
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (size) setState({ progress: Math.min(99, Math.round((received / size) * 100)) })
      if (!out.write(Buffer.from(value))) await once(out, 'drain')
    }
  } finally {
    out.end()
  }
  await finished(out)
}

/** Where the running app bundle lives, e.g. /Applications/BuddyUsage.app. */
function currentBundlePath(): string {
  // exe is .../BuddyUsage.app/Contents/MacOS/BuddyUsage
  return dirname(dirname(dirname(app.getPath('exe'))))
}

async function installMac(file: string, work: string): Promise<void> {
  const mount = join(work, 'mnt')
  await execFileAsync('hdiutil', ['attach', file, '-nobrowse', '-quiet', '-mountpoint', mount])
  try {
    const source = join(mount, `${APP}.app`)
    const running = currentBundlePath()
    const target = running.endsWith(`${APP}.app`) ? running : `/Applications/${APP}.app`
    const staged = join(dirname(target), `.${APP}.app.update`)
    const backup = join(dirname(target), `.${APP}.app.previous`)

    await rm(staged, { recursive: true, force: true })
    // ditto preserves the bundle exactly (symlinked frameworks, modes,
    // resource forks) so the ad-hoc signature stays valid.
    await execFileAsync('ditto', [source, staged])
    await rm(backup, { recursive: true, force: true })
    // Swap: a rename is atomic, and macOS is happy to keep running the old
    // bundle from its new name until we relaunch. The old bundle is removed
    // on the next launch (see cleanupAfterUpdate) — deleting the bundle a
    // process is running from is slow and unreliable from inside it.
    if (await stat(target).catch(() => null)) await rename(target, backup)
    await rename(staged, target)

    app.relaunch({ execPath: join(target, 'Contents', 'MacOS', APP) })
  } finally {
    await execFileAsync('hdiutil', ['detach', mount, '-quiet']).catch(() => undefined)
  }
}

async function installWindows(file: string): Promise<void> {
  // electron-builder's NSIS installer closes the running instance, installs
  // per-user and relaunches; we just need to get out of its way.
  spawn(file, ['/S'], { detached: true, stdio: 'ignore' }).unref()
}

async function installLinux(file: string): Promise<void> {
  const current = process.env['APPIMAGE']
  if (!current) throw new Error('Not running from an AppImage — download the new build from the release page.')
  const staged = `${current}.update`
  await cp(file, staged)
  await chmod(staged, 0o755)
  await rename(staged, current)
  app.relaunch({ execPath: current })
}

export async function installUpdate(): Promise<UpdateState> {
  if (state.status !== 'available' || !state.downloadUrl) {
    await checkForUpdates()
    if (state.status !== 'available' || !state.downloadUrl) return state
  }

  const work = await mkdtemp(join(tmpdir(), 'buddyusage-update-'))
  const file = join(work, assetNameFor())
  try {
    setState({ status: 'downloading', progress: 0, error: undefined })
    await download(state.downloadUrl, file, state.downloadSize)
    setState({ status: 'installing', progress: 100 })

    if (process.platform === 'darwin') await installMac(file, work)
    else if (process.platform === 'win32') await installWindows(file)
    else await installLinux(file)

    // Give the swap a beat to settle, then hand over to the new build.
    setTimeout(() => app.exit(0), 500)
    return state
  } catch (error) {
    console.error('[updater] install failed:', error)
    setState({
      status: 'error',
      error: error instanceof Error ? error.message : 'Update failed — use the download link instead.'
    })
    return state
  } finally {
    if (process.platform !== 'win32') await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function openDownloadPage(): void {
  void shell.openExternal(state.releaseUrl ?? latestRelease?.html_url ?? `https://github.com/${REPO}/releases/latest`)
}

/** Removes the previous bundle left beside the app by the last in-place update. */
export async function cleanupAfterUpdate(): Promise<void> {
  if (process.platform !== 'darwin') return
  const backup = join(dirname(currentBundlePath()), `.${APP}.app.previous`)
  await rm(backup, { recursive: true, force: true }).catch(() => undefined)
}

export function startUpdateChecks(): void {
  void cleanupAfterUpdate()
  setTimeout(() => void checkForUpdates({ notify: true }), FIRST_CHECK_DELAY_MS)
  setInterval(() => void checkForUpdates({ notify: true }), CHECK_INTERVAL_MS)
}
