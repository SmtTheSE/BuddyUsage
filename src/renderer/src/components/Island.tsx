import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ISLAND_LAYOUT, primaryMetric, type ProviderMeta, type UsageSnapshot } from '@shared/types'
import { selectEnabledProviders, useAppStore } from '../state/store'
import { IslandShape } from './IslandShape'
import { Ring } from './Ring'
import { ProviderIcon } from './ProviderIcon'
import { Popover } from './Popover'
import { CountUp } from './CountUp'
import { hasReadings, usageColor, USAGE_COLORS } from '../lib/usageColor'

const POPOVER_CLOSE_DELAY_MS = 260
const PEEK_CLOSE_DELAY_MS = 500
const COLLAPSED_WIDTH = 34
const SPRING = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 } as const

function ringLabel(snapshot?: UsageSnapshot): JSX.Element | string {
  if (!snapshot || snapshot.status === 'loading') return '…'
  if (snapshot.status === 'logged_out') return 'Sign in'
  if (snapshot.status === 'no_meter') return snapshot.planLabel ?? 'Free'
  const metric = primaryMetric(snapshot)
  return metric ? <CountUp value={metric.percentUsed} suffix="%" /> : '—'
}

/**
 * Keeps the mostly-transparent window from swallowing clicks: whenever the
 * cursor is over empty space we ask the main process to pass mouse events
 * through to whatever is underneath, and flip back the moment it re-enters
 * something marked `data-solid`.
 */
function useClickThrough(): void {
  useEffect(() => {
    let ignoring: boolean | null = null
    const update = (ignore: boolean): void => {
      if (ignore === ignoring) return
      ignoring = ignore
      void window.buddyUsage.setIgnoreMouse(ignore)
    }
    const onMove = (event: MouseEvent): void => {
      const target = document.elementFromPoint(event.clientX, event.clientY)
      update(!target?.closest('[data-solid]'))
    }
    window.addEventListener('mousemove', onMove)
    update(true)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
}

export function Island(): JSX.Element {
  const state = useAppStore()
  const providers = selectEnabledProviders(state)
  const edge = state.settings?.edge ?? 'right'
  const collapsed = state.settings?.islandCollapsed ?? false
  const updateReady = state.update?.status === 'available'

  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const peekTimer = useRef<ReturnType<typeof setTimeout>>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 })

  useClickThrough()

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(([entry]) =>
      setBodySize({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(body)
    const rect = body.getBoundingClientRect()
    setBodySize({ width: rect.width, height: rect.height })
    return () => observer.disconnect()
  }, [])

  const expanded = !collapsed || peek

  function open(providerId: string): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovered(providerId)
  }

  function scheduleClose(): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovered(null), POPOVER_CLOSE_DELAY_MS)
  }

  function onIslandEnter(): void {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    if (collapsed) setPeek(true)
  }

  function onIslandLeave(): void {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(false), PEEK_CLOSE_DELAY_MS)
  }

  function toggleCollapsed(): void {
    setPinned(null)
    setHovered(null)
    setPeek(false)
    void state.updateSettings({ islandCollapsed: !collapsed })
  }

  const activeId = expanded ? (pinned ?? hovered) : null
  const active: ProviderMeta | undefined = providers.find((p) => p.id === activeId)
  const activeCell = activeId ? cellRefs.current.get(activeId) : undefined
  const popoverTop = activeCell ? ISLAND_LAYOUT.islandInsetTop + activeCell.offsetTop + activeCell.offsetHeight / 2 : 0

  return (
    <div
      className={`island-root island-root--${edge}`}
      style={{ ['--island-width' as string]: `${bodySize.width || ISLAND_LAYOUT.islandWidth}px` }}
    >
      <motion.div
        ref={bodyRef}
        className={expanded ? 'island' : 'island island--collapsed'}
        data-solid
        animate={{ width: expanded ? ISLAND_LAYOUT.islandWidth : COLLAPSED_WIDTH }}
        transition={SPRING}
        onMouseEnter={onIslandEnter}
        onMouseLeave={onIslandLeave}
        onContextMenu={(event) => {
          event.preventDefault()
          void window.buddyUsage.showContextMenu()
        }}
      >
        {bodySize.height > 0 && (
          <IslandShape width={bodySize.width} height={bodySize.height} mirrored={edge === 'left'} />
        )}

        <AnimatePresence mode="wait" initial={false}>
          {expanded ? (
            <motion.div
              key="cells"
              className="island__cells"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18 }}
            >
              {providers.map((provider, index) => {
                const snapshot = state.usageByProvider[provider.id]
                const metric = primaryMetric(snapshot)
                const color = hasReadings(snapshot) ? usageColor(metric?.percentUsed) : USAGE_COLORS.idle
                const syncing = state.syncing[provider.id] === true
                return (
                  <motion.button
                    key={provider.id}
                    ref={(el) => {
                      if (el) cellRefs.current.set(provider.id, el)
                      else cellRefs.current.delete(provider.id)
                    }}
                    className={[
                      'cell',
                      activeId === provider.id ? 'cell--active' : '',
                      pinned === provider.id ? 'cell--pinned' : '',
                      syncing ? 'cell--syncing' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: index * 0.05 }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.96 }}
                    onMouseEnter={() => open(provider.id)}
                    onMouseLeave={scheduleClose}
                    onClick={() => setPinned((current) => (current === provider.id ? null : provider.id))}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void window.buddyUsage.showContextMenu(provider.id)
                    }}
                    aria-label={provider.name}
                  >
                    <Ring percent={hasReadings(snapshot) ? metric?.percentUsed : 0} color={color}>
                      <ProviderIcon providerId={provider.id} name={provider.name} size={28} />
                    </Ring>
                    <span className="cell__label">{ringLabel(snapshot)}</span>
                  </motion.button>
                )
              })}
              {providers.length === 0 && <span className="cell__label">Off</span>}
            </motion.div>
          ) : (
            <motion.div
              key="dots"
              className="island__dots"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {providers.map((provider) => {
                const snapshot = state.usageByProvider[provider.id]
                const color = hasReadings(snapshot)
                  ? usageColor(primaryMetric(snapshot)?.percentUsed)
                  : USAGE_COLORS.idle
                return <span key={provider.id} className="dot" style={{ background: color }} title={provider.name} />
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {updateReady && (
          <motion.span
            className="island__badge"
            data-solid
            title={`Update to ${state.update?.latestVersion} available`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={SPRING}
          />
        )}

        <button
          className="island__handle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand island' : 'Collapse island'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <motion.span
            className="island__handle-icon"
            animate={{ rotate: (edge === 'right') === collapsed ? 180 : 0 }}
            transition={SPRING}
          >
            ›
          </motion.span>
        </button>
      </motion.div>

      <AnimatePresence>
        {active && (
          <div key={active.id} className="popover-anchor" style={{ top: Math.max(8, popoverTop) }}>
            <Popover
              provider={active}
              snapshot={state.usageByProvider[active.id]}
              edge={edge}
              pinned={pinned === active.id}
              onMouseEnter={() => {
                open(active.id)
                onIslandEnter()
              }}
              onMouseLeave={() => {
                scheduleClose()
                onIslandLeave()
              }}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
