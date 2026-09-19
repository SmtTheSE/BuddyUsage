#!/usr/bin/env node
/**
 * BuddyUsage CLI — terminal companion to the island app.
 *
 * Reads the same on-disk cache the app maintains, so `buddyusage status`
 * works instantly with no IPC and even when the app isn't running (it just
 * reports the last-known values). Zero dependencies by design so it can be
 * run via `npx`/`npm i -g` straight from the GitHub repo.
 */
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, platform, tmpdir, arch as osArch } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const APP_NAME = 'BuddyUsage'
const REPO = 'SmtTheSE/BuddyUsage'
const WARN = 40
const CRITICAL = 70

const color = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
}

function cachePath() {
  const os = platform()
  if (os === 'darwin') return join(homedir(), 'Library', 'Application Support', APP_NAME, 'buddy-usage-cache.json')
  if (os === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), APP_NAME, 'buddy-usage-cache.json')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), APP_NAME, 'buddy-usage-cache.json')
}

function readCache() {
  const path = cachePath()
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

function paint(percent, text) {
  if (percent >= CRITICAL) return color.red(text)
  if (percent >= WARN) return color.yellow(text)
  return color.green(text)
}

function bar(percent, width = 24) {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return paint(percent, '█'.repeat(filled)) + color.dim('░'.repeat(width - filled))
}

function relative(iso) {
  if (!iso) return 'never'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)}h ago`
}

function status(args) {
  const cache = readCache()
  if (!cache) {
    console.error(`${APP_NAME} hasn't recorded any usage yet. Launch it with \`buddyusage open\` (or \`buddyusage install\` first).`)
    process.exit(2)
  }
  const snapshots = Object.values(cache.snapshots ?? {})
  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshots, null, 2))
    return
  }
  if (snapshots.length === 0) {
    console.log('No providers have reported yet.')
    return
  }
  for (const snap of snapshots) {
    const name = snap.providerId.charAt(0).toUpperCase() + snap.providerId.slice(1)
    const synced = color.dim(`synced ${relative(snap.lastSyncedAt)}`)
    if (snap.status === 'logged_out') {
      console.log(`${color.bold(name.padEnd(8))} ${color.dim('sign in required')}  ${synced}`)
      continue
    }
    if (snap.status === 'error' || !snap.metrics?.length) {
      console.log(`${color.bold(name.padEnd(8))} ${color.red(snap.message ?? 'error')}  ${synced}`)
      continue
    }
    const stale = snap.status === 'stale' ? color.yellow(' (stale)') : ''
    console.log(`${color.bold(name)}${snap.planLabel ? color.dim(` · ${snap.planLabel}`) : ''}${stale}  ${synced}`)
    for (const m of snap.metrics) {
      const pct = `${String(m.percentUsed).padStart(3)}%`
      const reset = m.resetLabel ? color.dim(`resets ${m.resetLabel}`) : ''
      console.log(`  ${m.label.padEnd(16)} ${bar(m.percentUsed)} ${paint(m.percentUsed, pct)}  ${reset}`)
    }
  }
}

function open() {
  if (platform() !== 'darwin') {
    console.error('`open` is only supported on macOS right now.')
    process.exit(1)
  }
  try {
    execFileSync('open', ['-a', APP_NAME], { stdio: 'ignore' })
    console.log(`${APP_NAME} launched.`)
  } catch {
    console.error(`${APP_NAME}.app isn't installed. Run \`buddyusage install\`.`)
    process.exit(1)
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'buddyusage-cli', Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'buddyusage-cli' } })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function install(args) {
  if (platform() !== 'darwin') {
    console.error('Installer currently supports macOS only. Download a build from https://github.com/' + REPO + '/releases')
    process.exit(1)
  }
  const versionArg = args.find((a) => a.startsWith('--version='))?.split('=')[1]
  const releaseUrl = versionArg
    ? `https://api.github.com/repos/${REPO}/releases/tags/${versionArg}`
    : `https://api.github.com/repos/${REPO}/releases/latest`

  console.log(`Looking up ${versionArg ?? 'latest'} release…`)
  const release = await fetchJson(releaseUrl)
  const arch = osArch() === 'arm64' ? 'arm64' : 'x64'
  const asset = release.assets?.find((a) => a.name === `${APP_NAME}-${arch}.dmg`)
  if (!asset) throw new Error(`No ${APP_NAME}-${arch}.dmg in release ${release.tag_name}.`)

  const work = mkdtempSync(join(tmpdir(), 'buddyusage-'))
  const dmg = join(work, asset.name)
  console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`)
  await download(asset.browser_download_url, dmg)

  const mount = join(work, 'mnt')
  console.log('Mounting…')
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-quiet', '-mountpoint', mount])
  try {
    const src = join(mount, `${APP_NAME}.app`)
    const dest = `/Applications/${APP_NAME}.app`
    console.log(`Installing to ${dest}…`)
    rmSync(dest, { recursive: true, force: true })
    execFileSync('cp', ['-R', src, dest])
    // The build is unsigned (no Apple Developer ID); without this Gatekeeper
    // reports the app as "damaged" the first time it's opened.
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', dest])
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-quiet'])
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`Installed ${APP_NAME} ${release.tag_name}. Launching…`)
  spawn('open', ['-a', APP_NAME], { detached: true, stdio: 'ignore' }).unref()
}

function help() {
  console.log(`${color.bold('buddyusage')} — AI coding assistant usage at a glance

Usage:
  buddyusage [status] [--json]   Show last-known usage for every provider
  buddyusage open                Launch the ${APP_NAME} app
  buddyusage install [--version=vX.Y.Z]
                                 Download the latest release from GitHub and
                                 install it to /Applications (macOS)
  buddyusage path                Print the cache file the app writes
  buddyusage help                This message`)
}

const [command = 'status', ...rest] = process.argv.slice(2)
const handlers = {
  status: () => status(rest),
  open,
  install: () => install(rest),
  path: () => console.log(cachePath()),
  help,
  '--help': help,
  '-h': help
}

const handler = handlers[command] ?? (command.startsWith('--') ? () => status([command, ...rest]) : undefined)
if (!handler) {
  console.error(`Unknown command: ${command}\n`)
  help()
  process.exit(1)
}

Promise.resolve(handler()).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
