import { useId } from 'react'
import { motion } from 'framer-motion'

interface RingProps {
  percent?: number
  color: string
  size?: number
  stroke?: number
  /** Soft shimmer while the first sync is in flight. */
  loading?: boolean
  /**
   * Where an even burn would have you by now (0-100). Drawn as a faint
   * tick: past it means you are ahead of pace for this window.
   */
  pacePercent?: number
  children?: React.ReactNode
}

const SPRING = { type: 'spring', stiffness: 70, damping: 18, mass: 0.9 } as const

/** Circular progress gauge with the provider mark in the centre and a lit cap at the arc's leading edge. */
export function Ring({ percent, color, size = 74, stroke = 6, loading = false, pacePercent, children }: RingProps): JSX.Element {
  const gradientId = useId()
  const glowId = useId()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0
  const offset = circumference * (1 - clamped / 100)
  const c = size / 2

  return (
    <div className={loading ? 'ring ring--loading' : 'ring'} style={{ width: size, height: size, ['--ring-color' as string]: color }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="1" />
            <stop offset="1" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
          <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={c} cy={c} r={radius} className="ring__track" strokeWidth={stroke} />
        {typeof pacePercent === 'number' && pacePercent > 2 && pacePercent < 99 && (
          <g transform={`rotate(${(Math.min(100, pacePercent) / 100) * 360} ${c} ${c})`}>
            <line
              className="ring__pace"
              x1={c}
              y1={c - radius - stroke / 2 - 1}
              x2={c}
              y2={c - radius + stroke / 2 + 1}
              strokeWidth={1.5}
            />
          </g>
        )}
        <motion.circle
          cx={c}
          cy={c}
          r={radius}
          className="ring__progress"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={SPRING}
          transform={`rotate(-90 ${c} ${c})`}
        />
        {/* Leading-edge cap: rotates with the arc so the tip always reads as "lit". */}
        <motion.g
          style={{ originX: '50%', originY: '50%' }}
          initial={{ rotate: 0, opacity: 0 }}
          animate={{ rotate: (clamped / 100) * 360, opacity: clamped > 1.5 ? 1 : 0 }}
          transition={SPRING}
        >
          <circle cx={c} cy={c - radius} r={stroke / 2 + 0.5} fill={color} filter={`url(#${glowId})`} />
          <circle cx={c} cy={c - radius} r={stroke / 4} fill="#fff" fillOpacity="0.85" />
        </motion.g>
      </svg>
      <div className="ring__icon">{children}</div>
    </div>
  )
}
