import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { shell } from 'electron'
import type { NudgeResult } from '@shared/types'
import { adapterFor } from './adapters'
import { forget, getSession, markStopping, registerOwnPid, rescanAgents, type InternalSession } from './agentMonitor'

const isWindows = process.platform === 'win32'
const STOP_GRACE_MS = 5_000
const NUDGE_TIMEOUT_MS = 4 * 60 * 1000
const NUDGE_REPLY_MAX = 4_000

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Stops a session. On macOS/Linux this is the interrupt Ctrl-C sends
 * (SIGINT): the CLI ends its turn, saves the conversation and exits, so
 * it can be resumed later. `force` escalates to SIGKILL if it is still
 * there after a grace period. Windows has no SIGINT for other processes,
 * so both paths terminate the process tree — the conversation is still on
 * disk and resumable.
 */
export async function stopSession(id: string, force = false): Promise<boolean> {
  const session = getSession(id)
  if (!session?.pid) return false
  const pid = session.pid
  markStopping(id)
  try {
    if (isWindows) {
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
      })
    } else {
      process.kill(pid, 'SIGINT')
      const deadline = Date.now() + STOP_GRACE_MS
      while (alive(pid) && Date.now() < deadline) await wait(250)
      if (alive(pid) && force) process.kill(pid, 'SIGKILL')
    }
  } catch {
    /* already gone */
  }
  if (!alive(pid)) forget(id)
  void rescanAgents()
  return !alive(pid)
}

/** Brings the app hosting the session's terminal to the front. Best effort per platform. */
export async function focusSession(id: string): Promise<boolean> {
  const session = getSession(id)
  if (!session) return false
  if (process.platform === 'darwin') {
    if (!session.hostApp) return false
    return new Promise((resolve) => execFile('open', ['-a', session.hostApp!], (err) => resolve(!err)))
  }
  if (isWindows) {
    const pid = session.hostPid ?? session.pid
    if (!pid) return false
    const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate(${pid})`
    return new Promise((resolve) =>
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err) => resolve(!err))
    )
  }
  const pid = session.hostPid ?? session.pid
  if (!pid) return false
  return new Promise((resolve) =>
    execFile('sh', ['-c', `xdotool windowactivate $(xdotool search --pid ${pid} | tail -1)`], (err) => resolve(!err))
  )
}

/** The shell line that reopens a conversation interactively. */
export async function resumeCommandFor(providerId: string, cwd: string | undefined, sessionId: string | undefined): Promise<string> {
  const adapter = adapterFor(providerId)
  if (!adapter) throw new Error(`${providerId} has no CLI to resume.`)
  const sid = sessionId ?? (cwd ? await adapter.latestSessionId(cwd).catch(() => undefined) : undefined)
  const resume = adapter.resumeCommand(sid)
  return cwd ? `cd ${shellQuote(cwd)} && ${resume}` : resume
}

function shellQuote(value: string): string {
  if (isWindows) return /[\s&|<>^]/.test(value) ? `"${value}"` : value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Opens a new terminal window running the resume command. Terminal.app on
 * macOS, cmd on Windows, the system default on Linux; if none of that
 * works the caller offers "Copy command" instead.
 */
export async function resumeInTerminal(providerId: string, cwd: string | undefined, sessionId: string | undefined): Promise<boolean> {
  const command = await resumeCommandFor(providerId, cwd, sessionId)
  if (process.platform === 'darwin') {
    const script = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(command)}\nend tell`
    return new Promise((resolve) => execFile('osascript', ['-e', script], (err) => resolve(!err)))
  }
  if (isWindows) {
    const cdPart = cwd ? `cd /d ${shellQuote(cwd)} && ` : ''
    const inner = `${cdPart}${adapterFor(providerId)!.resumeCommand(sessionId)}`
    const child = spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', inner], { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    return true
  }
  for (const term of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm']) {
    const args = term === 'gnome-terminal' ? ['--', 'bash', '-c', `${command}; exec bash`] : ['-e', `bash -c '${command.replace(/'/g, `'\\''`)}; exec bash'`]
    try {
      const child = spawn(term, args, { detached: true, stdio: 'ignore' })
      child.unref()
      return true
    } catch {
      /* try next */
    }
  }
  return false
}

/**
 * Sends a short follow-up to a conversation headlessly and returns the
 * reply. Uses each CLI's own resume flag rather than typing into the
 * user's terminal, which cannot be done reliably. Runs in the session's
 * project directory so the agent sees the same files.
 */
export async function nudge(providerId: string, text: string, session?: InternalSession): Promise<NudgeResult> {
  const adapter = adapterFor(providerId)
  const trimmed = text.trim()
  if (!adapter) return { providerId, ok: false, error: `${providerId} has no CLI to talk to.`, command: '' }
  if (!trimmed) return { providerId, ok: false, error: 'Nothing to send.', command: '' }

  const cwd = session?.cwd && existsSync(session.cwd) ? session.cwd : undefined
  const sessionId = session?.sessionId ?? (cwd ? await adapter.latestSessionId(cwd).catch(() => undefined) : undefined)
  const { file, args } = adapter.nudgeCommand(sessionId, trimmed)
  const command = [file, ...args.map((a) => (a === trimmed ? JSON.stringify(a) : a))].join(' ')

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: isWindows
    })
    const release = child.pid ? registerOwnPid(child.pid) : () => undefined
    const timer = setTimeout(() => {
      if (settled) return
      child.kill()
      finish({ providerId, ok: false, error: 'No reply within 4 minutes.', command })
    }, NUDGE_TIMEOUT_MS)

    function finish(result: NudgeResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      release()
      resolve(result)
    }

    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) =>
      finish({
        providerId,
        ok: false,
        error: err.message.includes('ENOENT') ? `${adapter.cli} is not on PATH for BuddyUsage.` : err.message,
        command
      })
    )
    child.on('close', (code) => {
      const reply = stdout.trim().slice(-NUDGE_REPLY_MAX)
      if (code === 0 || reply) finish({ providerId, ok: true, reply: reply || '(no output)', command })
      else finish({ providerId, ok: false, error: stderr.trim().slice(-600) || `${adapter.cli} exited with code ${code}`, command })
    })
  })
}

export function openExternal(url: string): void {
  void shell.openExternal(url)
}
