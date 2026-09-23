import { execFile } from 'child_process'
import { app } from 'electron'
import { dirname, resolve } from 'path'

/**
 * Without a paid Apple Developer ID the app can't be notarized, so a
 * browser-downloaded build carries a quarantine flag and macOS asks the
 * user to approve it once. They have now done exactly that — this window
 * is open — so the flag has served its purpose. Clearing it here means the
 * approval sticks: no second prompt after an in-place update, a move, or a
 * macOS version bump.
 *
 * This only ever touches BuddyUsage's own bundle, only after the user has
 * already allowed it to run, and silently does nothing if the bundle isn't
 * writable (for example an admin-installed copy).
 */
export function clearOwnQuarantineFlag(): void {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  // .../BuddyUsage.app/Contents/MacOS/BuddyUsage → .../BuddyUsage.app
  const bundle = resolve(dirname(app.getPath('exe')), '..', '..')
  if (!bundle.endsWith('.app')) return

  execFile('xattr', ['-p', 'com.apple.quarantine', bundle], (readError) => {
    // No attribute (installer script, or already cleared): nothing to do.
    if (readError) return
    execFile('xattr', ['-dr', 'com.apple.quarantine', bundle], (clearError) => {
      if (clearError) console.warn('[gatekeeper] could not clear the quarantine flag:', clearError.message)
      else console.log('[gatekeeper] quarantine flag cleared; macOS will not ask again for this copy')
    })
  })
}
