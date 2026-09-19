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

export function IslandShape({
  width,
  height,
  cornerRadius = 30,
  flareRadius = 22,
  mirrored = false
}: IslandShapeProps): JSX.Element {
  return (
    <svg
      className="island__shape"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d={islandPath(width, height, cornerRadius, flareRadius)} fill="#050505" />
    </svg>
  )
}
