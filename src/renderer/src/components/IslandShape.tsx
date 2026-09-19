interface IslandShapeProps {
  width: number
  height: number
  /** Radius of the rounded corners on the side facing away from the screen edge. */
  cornerRadius?: number
  /** Radius of the concave flares where the island meets the screen edge. */
  flareRadius?: number
  mirrored?: boolean
}

/**
 * The island's silhouette: a rounded slab flush against the screen edge, with
 * concave flares at the top and bottom so it reads as part of the bezel —
 * the same trick the MacBook notch uses, turned on its side.
 *
 * Path is authored for a right-edge dock (edge at x = width) and mirrored
 * for the left edge.
 */
export function islandPath(width: number, height: number, r: number, e: number): string {
  const w = width
  const bodyBottom = height - e
  return [
    `M ${r} ${e}`,
    `L ${w - e} ${e}`,
    `A ${e} ${e} 0 0 0 ${w} 0`,
    `L ${w} ${height}`,
    `A ${e} ${e} 0 0 0 ${w - e} ${bodyBottom}`,
    `L ${r} ${bodyBottom}`,
    `A ${r} ${r} 0 0 1 0 ${bodyBottom - r}`,
    `L 0 ${e + r}`,
    `A ${r} ${r} 0 0 1 ${r} ${e}`,
    'Z'
  ].join(' ')
}

/**
 * Liquid-glass rendering of the silhouette: a translucent tinted body, a
 * refractive edge (bright where light enters at the top-left, fading out),
 * and a soft specular bloom near the top. Electron can't blur the desktop
 * behind a shaped transparent window, so depth comes from these layers
 * rather than a backdrop blur.
 */
export function IslandShape({
  width,
  height,
  cornerRadius = 30,
  flareRadius = 22,
  mirrored = false
}: IslandShapeProps): JSX.Element {
  const r = Math.min(cornerRadius, Math.max(8, width / 2 - 2))
  const d = islandPath(width, height, r, flareRadius)
  const id = mirrored ? 'l' : 'r'

  return (
    <svg
      className="island__shape"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id={`glass-body-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--island-glass-top)" />
          <stop offset="1" stopColor="var(--island-glass-bottom)" />
        </linearGradient>
        <linearGradient id={`glass-edge-${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.14)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
        <radialGradient id={`glass-bloom-${id}`} cx="0.25" cy="0.12" r="0.7">
          <stop offset="0" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id={`glass-clip-${id}`}>
          <path d={d} />
        </clipPath>
      </defs>

      <path d={d} fill={`url(#glass-body-${id})`} />
      <rect width={width} height={height} fill={`url(#glass-bloom-${id})`} clipPath={`url(#glass-clip-${id})`} />
      <path
        d={d}
        fill="none"
        stroke={`url(#glass-edge-${id})`}
        strokeWidth="1.25"
        clipPath={`url(#glass-clip-${id})`}
        transform="translate(0.5 0.5)"
      />
    </svg>
  )
}
