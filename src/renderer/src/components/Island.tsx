import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ISLAND_LAYOUT, primaryMetric, type ProviderMeta, type UsageSnapshot } from '@shared/types'
import { selectEnabledProviders, useAppStore } from '../state/store'
import { IslandShape } from './IslandShape'
import { Ring } from './Ring'
import { ProviderIcon } from './ProviderIcon'
import { Popover } from './Popover'
import { CountUp } from './CountUp'
import { CoachMark } from './CoachMark'
import { hasReadings, paceReference, usageColor, USAGE_COLORS } from '../lib/usageColor'

const POPOVER_CLOSE_DELAY_MS = 260
const PEEK_CLOSE_DELAY_MS = 500
const COLLAPSED_WIDTH = 34
const SPRING = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 } as const

/** A value ("73%") reads large; a state ("Sign in", "Free") reads as a quiet pill. */
function ringLabel(snapshot?: UsageSnapshot): { node: JSX.Element | string; isState: boolean } {
  if (!snapshot || snapshot.status === 'loading') return { node: '…', isState: true }
  if (snapshot.status === 'logged_out') return { node: 'Sign in', isState: true }
  if (snapshot.status === 'no_meter') return { node: snapshot.planLabel ?? 'Free', isState: true }
  const metric = primaryMetric(snapshot)
  return metric ? { node: <CountUp value={metric.percentUsed} suffix="%" />, isState: false } : { node: '—', isState: true }
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
  // The welcome window covers a fresh install; the inline hint is for the
  // island itself once that window is gone.
  const showCoach = state.settings !== null && !state.settings.onboardingSeen && !collapsed

  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const peekTimer = useRef<ReturnType<typeof setTimeout>>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 })
  const [popoverHeight, setPopoverHeight] = useState(0)
  const popoverObserver = useRef<ResizeObserver>()

  useClickThrough()

  useEffect(() => {
    const onPin = (event: Event): void => setPinned((event as CustomEvent<string>).detail)
    window.addEventListener('buddy:pin', onPin)
    return () => window.removeEventListener('buddy:pin', onPin)
  }, [])

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
  // Centre the card on its ring, but keep it inside the window. The card's
  // height varies (sessions, nudge reply), so measure it rather than guess.
  const POPOVER_HALF = Math.max(130, popoverHeight / 2)
  const rawTop = activeCell ? ISLAND_LAYOUT.islandInsetTop + activeCell.offsetTop + activeCell.offsetHeight / 2 : 0
  const popoverTop = Math.min(Math.max(POPOVER_HALF + 8, rawTop), ISLAND_LAYOUT.windowHeight - POPOVER_HALF - 8)

  return (
    <div
      className={`island-root island-root--${edge}`}
      style={{ ['--island-width' as string]: `${bodySize.width || ISLAND_LAYOUT.islandWidth}px` }}
    >
      <motion.div
        ref={bodyRef}
        className={expanded ? 'island' : 'island island--collapsed'}
        data-solid
        initial={{ x: edge === 'right' ? 80 : -80, opacity: 0 }}
        animate={{ x: 0, opacity: 1, width: expanded ? ISLAND_LAYOUT.islandWidth : COLLAPSED_WIDTH }}
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
                const sessions = state.agents.sessions.filter((a) => a.providerId === provider.id)
                const sessionCount = sessions.length
                const presence = sessions.some((a) => a.state === 'attention') ? 'attention' : sessionCount > 0 ? 'running' : null
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
                      syncing ? 'cell--syncing' : '',
                      presence === 'attention' ? 'cell--attention' : presence === 'running' ? 'cell--running' : ''
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
                    <Ring
                      percent={hasReadings(snapshot) ? metric?.percentUsed : 0}
                      color={color}
                      loading={!snapshot || snapshot.status === 'loading' || (syncing && !hasReadings(snapshot))}
                      pacePercent={hasReadings(snapshot) ? paceReference(metric) : undefined}
                    >
                      <ProviderIcon providerId={provider.id} name={provider.name} size={28} />
                    </Ring>
                    {presence && (
                      <span
                        className={`cell__presence cell__presence--${presence}`}
                        title={
                          presence === 'attention'
                            ? `${provider.name} needs you`
                            : `${sessionCount} ${provider.name} session${sessionCount === 1 ? '' : 's'} running`
                        }
                        aria-label={presence === 'attention' ? 'Needs attention' : 'Running'}
                      >
                        {sessionCount > 1 ? sessionCount : ''}
                      </span>
                    )}
                    {(() => {
                      const label = ringLabel(snapshot)
                      return (
                        <span className={label.isState ? 'cell__label cell__label--state' : 'cell__label'}>
                          {label.node}
                        </span>
                      )
                    })()}
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
                const live = state.agents.sessions.filter((a) => a.providerId === provider.id)
                const dotClass = live.some((a) => a.state === 'attention') ? 'dot dot--attention' : live.length ? 'dot dot--running' : 'dot'
                return <span key={provider.id} className={dotClass} style={{ background: color }} title={provider.name} />
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

      <AnimatePresence>{showCoach && !active && <CoachMark key="coach" edge={edge} />}</AnimatePresence>

      <AnimatePresence>
        {active && (
          <div
            key={active.id}
            className="popover-anchor"
            style={{ top: popoverTop }}
            ref={(el) => {
              popoverObserver.current?.disconnect()
              if (!el) return
              popoverObserver.current = new ResizeObserver(([entry]) => setPopoverHeight(entry.contentRect.height))
              popoverObserver.current.observe(el)
            }}
          >
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
