import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { ScreenEdge } from '@shared/types'
import { useAppStore } from '../state/store'

const AUTO_DISMISS_MS = 14_000

/** One-time first-run hint. Everything the island can do is discoverable, but this saves the first minute. */
export function CoachMark({ edge }: { edge: ScreenEdge }): JSX.Element {
  const updateSettings = useAppStore((s) => s.updateSettings)
  const dismiss = (): void => void updateSettings({ onboardingSeen: true })

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className={`coach coach--${edge}`}
      data-solid
      initial={{ opacity: 0, x: edge === 'right' ? 12 : -12, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.9 }}
    >
      <div className="coach__title">Your usage, at a glance</div>
      <ul className="coach__list">
        <li>
          <span className="coach__key">Hover</span> a ring for details · <span className="coach__key">click</span> to pin
        </li>
        <li>
          <span className="coach__key">Drag</span> the island anywhere — it snaps to an edge
        </li>
        <li>
          <span className="coach__key">‹</span> collapses it to a slim tab
        </li>
      </ul>
      <button className="button button--small button--tinted" onClick={dismiss}>
        Got it
      </button>
    </motion.div>
  )
}
