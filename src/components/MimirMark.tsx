// The Mimir mark — inline SVG version of the PNG icon. Used in the
// launcher header and the login screen so the brand mark is sharp at any
// size and doesn't require a network round-trip.
//
// Same geometry as scripts/gen-icons.mjs so the inline mark and the PWA
// icon match pixel-for-pixel.

const GOLD = '#d4b85a'
const GOLD_DIM = '#a08938'
const BG = '#0a0a0a'

interface Props {
  size?: number
  /** Show the rounded background tile. Off by default so the mark blends
   *  into wherever it's placed; turn on for an "app icon" look. */
  tile?: boolean
}

export function MimirMark({ size = 48, tile = true }: Props) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="Mimir"
    >
      <defs>
        <linearGradient id="mimir-horizon" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={GOLD} stopOpacity="0" />
          <stop offset="0.18" stopColor={GOLD} stopOpacity="0.55" />
          <stop offset="0.5" stopColor={GOLD} stopOpacity="0.95" />
          <stop offset="0.82" stopColor={GOLD} stopOpacity="0.55" />
          <stop offset="1" stopColor={GOLD} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="mimir-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={GOLD} stopOpacity="0.55" />
          <stop offset="0.6" stopColor={GOLD} stopOpacity="0.10" />
          <stop offset="1" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
      </defs>

      {tile && <rect width="512" height="512" rx="112" fill={BG} />}

      <circle cx="256" cy="256" r="170" fill="url(#mimir-glow)" />
      <rect x="40" y="252" width="432" height="8" rx="4" fill="url(#mimir-horizon)" />
      <circle cx="256" cy="256" r="116" fill="none" stroke={GOLD} strokeWidth="6" />

      {[30, 150, 270].map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const r1 = 140
        const r2 = 156
        const x1 = 256 + Math.cos(rad) * r1
        const y1 = 256 + Math.sin(rad) * r1
        const x2 = 256 + Math.cos(rad) * r2
        const y2 = 256 + Math.sin(rad) * r2
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={GOLD_DIM}
            strokeWidth="5"
            strokeLinecap="round"
          />
        )
      })}

      <circle cx="256" cy="256" r="42" fill={GOLD} />
      <circle cx="256" cy="256" r="14" fill={BG} />
    </svg>
  )
}
