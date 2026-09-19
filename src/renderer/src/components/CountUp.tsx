import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  suffix?: string
  durationMs?: number
}

/** Animates a number from its previous value to the new one — the ring label "rolls" instead of snapping. */
export function CountUp({ value, suffix = '', durationMs = 700 }: CountUpProps): JSX.Element {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const start = performance.now()
    let frame = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) frame = requestAnimationFrame(step)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])

  return (
    <>
      {shown}
      {suffix}
    </>
  )
}
