import type { ReactNode } from 'react'

interface Props {
  /** Fill fraction, 0–1 (clamped). */
  fraction: number
  /** Unique id — SVG <linearGradient> defs collide if shared. */
  gradientId: string
  from?: string
  to?: string
  track?: string
  glow?: string
  size?: number
  children?: ReactNode
}

const R = 52
const CIRC = 2 * Math.PI * R // 326.7

export function RingGauge({
  fraction,
  gradientId,
  from = '#7dd3fc',
  to = '#a78bfa',
  track = 'rgba(255,255,255,0.08)',
  glow,
  size = 156,
  children,
}: Props) {
  const pct = Math.max(0, Math.min(1, fraction))
  const offset = CIRC * (1 - pct)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="block h-full w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke={track} strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{
            filter: glow ? `drop-shadow(0 0 6px ${glow})` : undefined,
            transition: 'stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
