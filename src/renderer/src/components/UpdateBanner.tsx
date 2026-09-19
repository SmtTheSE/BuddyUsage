import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/store'

interface UpdateBannerProps {
  /** Slim single-line variant for the popover; full card for Settings. */
  compact?: boolean
}

function formatMb(bytes?: number): string {
  return bytes ? `${(bytes / 1e6).toFixed(0)} MB` : ''
}

/**
 * The one place a user learns a new version exists and gets it with one
 * click — no terminal, no hunting for the right file. The download link
 * stays available as a fallback if the in-place install can't run.
 */
export function UpdateBanner({ compact = false }: UpdateBannerProps): JSX.Element | null {
  const update = useAppStore((s) => s.update)
  if (!update) return null

  const busy = update.status === 'downloading' || update.status === 'installing'
  const show = update.status === 'available' || busy || (update.status === 'error' && !compact)
  if (compact && !show) return null

  const install = (): void => void window.buddyUsage.installUpdate()
  const download = (): void => void window.buddyUsage.openDownloadPage()
  const check = (): void => void window.buddyUsage.checkForUpdates()

  if (compact) {
    return (
      <AnimatePresence>
        <motion.div
          className="update-banner update-banner--compact"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <span className="update-banner__dot" aria-hidden="true" />
          {busy ? (
            <span>
              {update.status === 'installing' ? 'Installing…' : `Downloading ${update.progress ?? 0}%`}
            </span>
          ) : (
            <>
              <span>BuddyUsage {update.latestVersion} is available</span>
              <button className="button button--small button--tinted" onClick={install}>
                Update
              </button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="update-card">
      <div className="row">
        <span className="row__main">
          <span className="row__label">
            {update.status === 'available' && `Version ${update.latestVersion} is available`}
            {update.status === 'downloading' && `Downloading ${update.latestVersion}…`}
            {update.status === 'installing' && 'Installing — BuddyUsage will restart'}
            {update.status === 'up_to_date' && "You're on the latest version"}
            {update.status === 'checking' && 'Checking for updates…'}
            {update.status === 'error' && "Couldn't update automatically"}
            {update.status === 'idle' && `Version ${update.currentVersion}`}
          </span>
          <span className="row__hint">
            {update.status === 'available' && `You have ${update.currentVersion}. ${formatMb(update.downloadSize)} download, installs in place.`}
            {update.status === 'error' && update.error}
            {(update.status === 'up_to_date' || update.status === 'idle') && `Version ${update.currentVersion}`}
          </span>
        </span>
        <span className="row__actions">
          {update.status === 'available' && (
            <button className="button button--small button--tinted" onClick={install}>
              Update now
            </button>
          )}
          {(update.status === 'available' || update.status === 'error') && (
            <button className="button button--small" onClick={download}>
              Download ↗
            </button>
          )}
          {(update.status === 'up_to_date' || update.status === 'idle' || update.status === 'error') && (
            <button className="button button--small" onClick={check}>
              Check
            </button>
          )}
        </span>
      </div>
      {busy && (
        <div className="update-card__track">
          <motion.div
            className="update-card__fill"
            animate={{ width: `${update.status === 'installing' ? 100 : (update.progress ?? 0)}%` }}
            transition={{ type: 'tween', duration: 0.25 }}
          />
        </div>
      )}
    </div>
  )
}
