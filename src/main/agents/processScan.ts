import { execFile } from 'child_process'
import { readlink } from 'fs/promises'
import { basename } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** A raw process as the OS reports it, before we decide whether it is an agent. */
export interface ScannedProcess {
  pid: number
  ppid: number
  /** Executable path or name (argv[0]). */
  exe: string
  /** Full command line. */
  command: string
  startedAt?: string
  cwd?: string
}

const isWindows = process.platform === 'win32'

/**
 * Lists every process with its parent, start time and command line.
 * `ps` on Unix; a PowerShell CIM query on Windows. Never throws — an
 * unsupported or failing scan just yields an empty list and the caller
 * reports "scan unavailable".
 */
export async function listProcesses(): Promise<ScannedProcess[]> {
  try {
    return isWindows ? await listWindows() : await listUnix()
  } catch {
    return []
  }
}

async function listUnix(): Promise<ScannedProcess[]> {
  // `comm` is the executable on its own (a full path on macOS, the short
  // name on Linux); `args` is the full command line. Two calls joined on
  // pid avoid guessing where argv[0] ends. `lstart` is fixed-width.
  const [{ stdout: commOut }, { stdout: argsOut }] = await Promise.all([
    execFileAsync('ps', ['-axo', 'pid=,ppid=,lstart=,comm='], { maxBuffer: 16 * 1024 * 1024 }),
    execFileAsync('ps', ['-axo', 'pid=,args='], { maxBuffer: 16 * 1024 * 1024 })
  ])
  const args = new Map<number, string>()
  for (const line of argsOut.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match) args.set(Number(match[1]), match[2].trim())
  }
  const rows: ScannedProcess[] = []
  for (const line of commOut.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.{24})\s+(.*)$/.exec(line)
    if (!match) continue
    const pid = Number(match[1])
    const started = new Date(match[3].trim())
    rows.push({
      pid,
      ppid: Number(match[2]),
      exe: match[4].trim(),
      command: args.get(pid) ?? match[4].trim(),
      startedAt: Number.isNaN(started.getTime()) ? undefined : started.toISOString()
    })
  }
  return rows
}

async function listWindows(): Promise<ScannedProcess[]> {
  // Single quotes only: the script travels through Windows argument quoting.
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath," +
    "@{n='Started';e={if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}}} | ConvertTo-Json -Compress"
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  })
  const parsed = JSON.parse(stdout || '[]') as Array<{
    ProcessId: number
    ParentProcessId: number
    CommandLine?: string | null
    ExecutablePath?: string | null
    Started?: string | null
  }>
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((p) => ({
    pid: p.ProcessId,
    ppid: p.ParentProcessId,
    exe: p.ExecutablePath || firstToken(p.CommandLine || ''),
    command: p.CommandLine || p.ExecutablePath || '',
    startedAt: p.Started || undefined
  }))
}

/** argv[0] of a command line, honouring quotes and paths with spaces as `ps` prints them. */
function firstToken(command: string): string {
  const trimmed = command.trim()
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    return end > 0 ? trimmed.slice(1, end) : trimmed
  }
  // macOS app bundles have spaces in their path ("Claude Helper.app/...");
  // take everything up to the first " -" flag or " /" absolute argument.
  const cut = trimmed.search(/\s(?=-|\/|[A-Za-z]:\\)/)
  return cut === -1 ? trimmed : trimmed.slice(0, cut)
}

export function exeName(exe: string): string {
  return basename(exe).replace(/\.exe$/i, '')
}

/**
 * Working directories for a set of pids. `/proc` on Linux; one `lsof` call
 * on macOS. Windows has no cheap way to ask, so the caller falls back to
 * the session files each CLI writes (which record the cwd).
 */
export async function lookupCwds(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (pids.length === 0) return result
  if (process.platform === 'linux') {
    await Promise.all(
      pids.map(async (pid) => {
        try {
          result.set(pid, await readlink(`/proc/${pid}/cwd`))
        } catch {
          /* gone or not ours */
        }
      })
    )
    return result
  }
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'], {
        maxBuffer: 4 * 1024 * 1024
      })
      let current: number | undefined
      for (const line of stdout.split('\n')) {
        if (line.startsWith('p')) current = Number(line.slice(1))
        else if (line.startsWith('n') && current !== undefined) result.set(current, line.slice(1))
      }
    } catch {
      /* lsof missing or denied: cwd stays unknown */
    }
  }
  return result
}

/**
 * Walks up the parent chain to find the application hosting a session's
 * terminal — the thing to bring to the front for "jump to it".
 */
export function findHostApp(pid: number, byPid: Map<number, ScannedProcess>): string | undefined {
  // Start at the parent: the CLI itself may live inside a bundle (Claude's
  // desktop app ships its own claude.app) that is not the window to show.
  let current = byPid.get(byPid.get(pid)?.ppid ?? -1)
  for (let depth = 0; current && depth < 12; depth++) {
    const exe = current.exe
    if (process.platform === 'darwin') {
      const app = /^(.*?\/[^/]+\.app)\//.exec(exe)?.[1]
      // The outermost bundle is the app itself (helpers live inside it).
      if (app && !/\.app\/Contents\//.test(app)) return app
    } else {
      const name = exeName(exe).toLowerCase()
      if (HOST_APPS.has(name)) return current.exe
    }
    if (current.ppid <= 1) break
    current = byPid.get(current.ppid)
  }
  return undefined
}

const HOST_APPS = new Set([
  'windowsterminal',
  'wt',
  'cmd',
  'powershell',
  'pwsh',
  'conhost',
  'code',
  'cursor',
  'alacritty',
  'kitty',
  'wezterm-gui',
  'wezterm',
  'gnome-terminal-server',
  'konsole',
  'xterm',
  'ghostty',
  'warp',
  'hyper',
  'tilix',
  'terminator',
  'idea',
  'webstorm'
])
