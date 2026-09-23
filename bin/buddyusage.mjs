#!/usr/bin/env node
/**
 * BuddyUsage CLI — terminal companion to the island app.
 *
 * Reads the same on-disk cache the app maintains, so `buddyusage status`
 * works instantly with no IPC and even when the app isn't running (it just
 * reports the last-known values). Zero dependencies by design so it can be
 * run via `npx`/`npm i -g` straight from the GitHub repo.
 */
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { homedir, platform, tmpdir, arch as osArch } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const APP_NAME = 'BuddyUsage'
const REPO = 'SmtTheSE/BuddyUsage'
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()
const WARN = 40
const CRITICAL = 70

const color = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
}

function storePath(file) {
  const os = platform()
  if (os === 'darwin') return join(homedir(), 'Library', 'Application Support', APP_NAME, file)
  if (os === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), APP_NAME, file)
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), APP_NAME, file)
}

function cachePath() {
  return storePath('buddy-usage-cache.json')
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
    const NAMES = { chatgpt: 'ChatGPT', copilot: 'Copilot', cursor: 'Cursor' }
    const name = NAMES[snap.providerId] ?? snap.providerId.charAt(0).toUpperCase() + snap.providerId.slice(1)
    const synced = color.dim(`synced ${relative(snap.lastSyncedAt)}`)
    if (snap.status === 'logged_out') {
      console.log(`${color.bold(name.padEnd(8))} ${color.dim('sign in required')}  ${synced}`)
      continue
    }
    if (snap.status === 'no_meter') {
      console.log(`${color.bold(name.padEnd(8))} ${color.dim(`${snap.planLabel ?? 'Free'} plan · no usage meter published`)}  ${synced}`)
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

const WIN_EXE = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', APP_NAME, `${APP_NAME}.exe`)
const LINUX_APPIMAGE = join(homedir(), '.local', 'bin', `${APP_NAME}.AppImage`)

function launch() {
  const os = platform()
  if (os === 'darwin') {
    execFileSync('open', ['-a', APP_NAME], { stdio: 'ignore' })
  } else if (os === 'win32') {
    if (!existsSync(WIN_EXE)) throw new Error(`${WIN_EXE} not found`)
    spawn(WIN_EXE, [], { detached: true, stdio: 'ignore' }).unref()
  } else {
    if (!existsSync(LINUX_APPIMAGE)) throw new Error(`${LINUX_APPIMAGE} not found`)
    spawn(LINUX_APPIMAGE, [], { detached: true, stdio: 'ignore' }).unref()
  }
}

function open() {
  try {
    launch()
    console.log(`${APP_NAME} launched.`)
  } catch {
    console.error(`${APP_NAME} isn't installed. Run \`buddyusage install\`.`)
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

function assetNameFor(os, arch) {
  if (os === 'darwin') return `${APP_NAME}-${arch}.dmg`
  if (os === 'win32') return `${APP_NAME}-${arch}.exe`
  // electron-builder uses the Linux convention for the x64 AppImage name.
  return `${APP_NAME}-${arch === 'x64' ? 'x86_64' : 'arm64'}.AppImage`
}

async function installMac(file) {
  const mount = join(dirname(file), 'mnt')
  console.log('Mounting…')
  execFileSync('hdiutil', ['attach', file, '-nobrowse', '-quiet', '-mountpoint', mount])
  try {
    const dest = `/Applications/${APP_NAME}.app`
    console.log(`Installing to ${dest}…`)
    rmSync(dest, { recursive: true, force: true })
    execFileSync('cp', ['-R', join(mount, `${APP_NAME}.app`), dest])
    // The build is unsigned (no Apple Developer ID); without this Gatekeeper
    // reports the app as "damaged" the first time it's opened.
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', dest])
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-quiet'])
  }
}

function installWindows(file) {
  // One-click NSIS installer: installs per-user and launches when done.
  console.log('Running installer…')
  execFileSync(file, ['/S'], { stdio: 'ignore' })
}

function installLinux(file) {
  mkdirSync(dirname(LINUX_APPIMAGE), { recursive: true })
  copyFileSync(file, LINUX_APPIMAGE)
  chmodSync(LINUX_APPIMAGE, 0o755)
  console.log(`Installed to ${LINUX_APPIMAGE} (make sure ~/.local/bin is on your PATH).`)
}

async function install(args) {
  const os = platform()
  const versionArg = args.find((a) => a.startsWith('--version='))?.split('=')[1]
  const releaseUrl = versionArg
    ? `https://api.github.com/repos/${REPO}/releases/tags/${versionArg}`
    : `https://api.github.com/repos/${REPO}/releases/latest`

  console.log(`Looking up ${versionArg ?? 'latest'} release…`)
  const release = await fetchJson(releaseUrl)
  const arch = osArch() === 'arm64' ? 'arm64' : 'x64'
  const wanted = assetNameFor(os, arch)
  const asset = release.assets?.find((a) => a.name === wanted)
  if (!asset) throw new Error(`No ${wanted} in release ${release.tag_name}.`)

  const work = mkdtempSync(join(tmpdir(), 'buddyusage-'))
  const file = join(work, asset.name)
  console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`)
  await download(asset.browser_download_url, file)

  try {
    if (os === 'darwin') await installMac(file)
    else if (os === 'win32') installWindows(file)
    else installLinux(file)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  console.log(`Installed ${APP_NAME} ${release.tag_name}. Launching…`)
  if (os !== 'win32') launch()
}

/** Rolls the app's day index up into totals for the last `days` days. */
function activityReport(days) {
  const path = storePath('buddy-usage-activity.json')
  if (!existsSync(path)) return undefined
  const index = JSON.parse(readFileSync(path, 'utf8')).days ?? {}
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const projects = new Map()
  const models = new Map()
  let total = 0
  let turns = 0
  for (const [day, providers] of Object.entries(index)) {
    if (day < from) continue
    for (const projectsByProvider of Object.values(providers)) {
      for (const [projectPath, byModel] of Object.entries(projectsByProvider)) {
        for (const [model, t] of Object.entries(byModel)) {
          const name = projectPath === 'unknown' ? 'unknown' : projectPath.split('/').pop()
          projects.set(name, (projects.get(name) ?? 0) + t.total)
          models.set(model, (models.get(model) ?? 0) + t.total)
          total += t.total
          turns += t.turns ?? 0
        }
      }
    }
  }
  return { days, total, turns, projects: Object.fromEntries(projects), models: Object.fromEntries(models) }
}

/** The activity report the app keeps: tokens per project/model/day, read from the CLIs' own logs. */
function activity(args) {
  const days = Number((args.find((a) => a.startsWith('--days=')) ?? '').split('=')[1]) || 7
  const report = activityReport(days)
  if (!report) {
    console.error(`No activity data yet. Open ${APP_NAME} once so it can read your session logs.`)
    process.exit(1)
  }
  const { total, turns } = report
  const projects = new Map(Object.entries(report.projects))
  const models = new Map(Object.entries(report.models))
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const compact = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
  console.log(`\n${color.bold(`Last ${days} day${days === 1 ? '' : 's'}`)}  ${compact(total)} tokens · ${turns.toLocaleString()} turns\n`)
  const show = (title, map) => {
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    if (rows.length === 0) return
    console.log(color.dim(title))
    const max = rows[0][1] || 1
    for (const [label, value] of rows) {
      const width = Math.max(1, Math.round((value / max) * 22))
      const share = total ? Math.round((value / total) * 100) : 0
      console.log(`  ${label.padEnd(24).slice(0, 24)} ${color.green('█'.repeat(width)).padEnd(22)} ${String(share).padStart(3)}%  ${compact(value)}`)
    }
    console.log('')
  }
  show('By project', projects)
  show('By model', models)
}

/** Serve usage over MCP so the agents themselves can check their budget. */
async function mcp() {
  const { createServer, serveStdio } = await import('./mcp.mjs')
  const server = createServer({
    version: VERSION,
    readUsage: () => Object.values(readCache()?.snapshots ?? {}),
    readActivity: (days) => activityReport(days)
  })
  serveStdio(server)
}

function help() {
  console.log(`${color.bold('buddyusage')} — AI coding assistant usage at a glance

Usage:
  buddyusage [status] [--json]   Show last-known usage for every provider
  buddyusage open                Launch the ${APP_NAME} app
  buddyusage install [--version=vX.Y.Z]
                                 Download the latest release from GitHub and
                                 install it (macOS, Windows, Linux)
  buddyusage activity [--days=7] [--json]
                                 Tokens by project and model, from the
                                 session logs on this computer
  buddyusage mcp                 Run as an MCP server (stdio) so Claude Code,
                                 Codex and other agents can read your usage:
                                   claude mcp add buddyusage -- buddyusage mcp
  buddyusage path                Print the cache file the app writes
  buddyusage help                This message`)
}

const [command = 'status', ...rest] = process.argv.slice(2)
const handlers = {
  status: () => status(rest),
  open,
  install: () => install(rest),
  activity: () => activity(rest),
  mcp,
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
