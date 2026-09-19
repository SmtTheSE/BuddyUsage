import { motion } from 'framer-motion'

interface RingProps {
  percent?: number
  color: string
  size?: number
  stroke?: number
  children?: React.ReactNode
}

/** Circular progress gauge with the provider mark in the centre. */
export function Ring({ percent, color, size = 74, stroke = 6, children }: RingProps): JSX.Element {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="ring__track" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="ring__progress"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__icon">{children}</div>
    </div>
  )
}
