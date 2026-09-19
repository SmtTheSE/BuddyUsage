import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ISLAND_LAYOUT, primaryMetric, type ProviderMeta, type UsageSnapshot } from '@shared/types'
import { selectEnabledProviders, useAppStore } from '../state/store'
import { IslandShape } from './IslandShape'
import { Ring } from './Ring'
import { ProviderIcon } from './ProviderIcon'
import { Popover } from './Popover'
import { hasReadings, usageColor, USAGE_COLORS } from '../lib/usageColor'

const POPOVER_CLOSE_DELAY_MS = 260

function ringLabel(snapshot?: UsageSnapshot): string {
  if (!snapshot || snapshot.status === 'loading') return '…'
  if (snapshot.status === 'logged_out') return 'Sign in'
  const metric = primaryMetric(snapshot)
  return metric ? `${metric.percentUsed}%` : '—'
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

  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const bodyRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  const [bodyHeight, setBodyHeight] = useState(0)

  useClickThrough()

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(([entry]) => setBodyHeight(entry.contentRect.height))
    observer.observe(body)
    setBodyHeight(body.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  function open(providerId: string): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovered(providerId)
  }

  function scheduleClose(): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovered(null), POPOVER_CLOSE_DELAY_MS)
  }

  const activeId = pinned ?? hovered
  const active: ProviderMeta | undefined = providers.find((p) => p.id === activeId)
  const activeCell = activeId ? cellRefs.current.get(activeId) : undefined
  const popoverTop = activeCell ? ISLAND_LAYOUT.islandInsetTop + activeCell.offsetTop + activeCell.offsetHeight / 2 : 0

  return (
    <div className={`island-root island-root--${edge}`}>
      <div
        ref={bodyRef}
        className="island"
        data-solid
        style={{ width: ISLAND_LAYOUT.islandWidth }}
        onContextMenu={(event) => {
          event.preventDefault()
          void window.buddyUsage.showContextMenu()
        }}
      >
        {bodyHeight > 0 && (
          <IslandShape width={ISLAND_LAYOUT.islandWidth} height={bodyHeight} mirrored={edge === 'left'} />
        )}

        <div className="island__cells">
          {providers.map((provider) => {
            const snapshot = state.usageByProvider[provider.id]
            const metric = primaryMetric(snapshot)
            const color = hasReadings(snapshot) ? usageColor(metric?.percentUsed) : USAGE_COLORS.idle
            return (
              <button
                key={provider.id}
                ref={(el) => {
                  if (el) cellRefs.current.set(provider.id, el)
                  else cellRefs.current.delete(provider.id)
                }}
                className={activeId === provider.id ? 'cell cell--active' : 'cell'}
                onMouseEnter={() => open(provider.id)}
                onMouseLeave={scheduleClose}
                onClick={() => setPinned((current) => (current === provider.id ? null : provider.id))}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void window.buddyUsage.showContextMenu(provider.id)
                }}
                aria-label={`${provider.name}: ${ringLabel(snapshot)}`}
              >
                <Ring percent={hasReadings(snapshot) ? metric?.percentUsed : 0} color={color}>
                  <ProviderIcon providerId={provider.id} name={provider.name} size={28} />
                </Ring>
                <span className="cell__label">{ringLabel(snapshot)}</span>
              </button>
            )
          })}
          {providers.length === 0 && <span className="cell__label">Off</span>}
        </div>
      </div>

      <AnimatePresence>
        {active && (
          <div
            key={active.id}
            className="popover-anchor"
            style={{ top: Math.max(8, popoverTop) }}
          >
            <Popover
              provider={active}
              snapshot={state.usageByProvider[active.id]}
              edge={edge}
              onMouseEnter={() => open(active.id)}
              onMouseLeave={scheduleClose}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
