import { execFile } from 'child_process'
import { delimiter } from 'path'

/**
 * A packaged app launched from Finder/Dock inherits a bare PATH, so
 * `claude`, `codex` and `gemini` (Homebrew, npm, ~/.local/bin) would be
 * invisible to nudges and resumes. Ask the user's login shell for its PATH
 * once and merge it in. No-op on Windows, where the registry PATH is
 * already inherited.
 */
export async function adoptLoginShellPath(): Promise<void> {
  if (process.platform === 'win32') return
  const shellBin = process.env.SHELL || '/bin/sh'
  const fromShell = await new Promise<string>((resolve) => {
    execFile(shellBin, ['-ilc', 'echo -n "$PATH"'], { timeout: 5_000, env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' } }, (err, stdout) =>
      resolve(err ? '' : String(stdout).trim())
    )
  })
  const merged = new Set<string>()
  for (const part of [...fromShell.split(delimiter), ...(process.env.PATH ?? '').split(delimiter)]) {
    if (part) merged.add(part)
  }
  for (const extra of [`${process.env.HOME}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin']) merged.add(extra)
  process.env.PATH = [...merged].join(delimiter)
}
