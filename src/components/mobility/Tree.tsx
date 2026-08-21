import type { MobilityLog } from '../../lib/mobility'

type P = [number, number]
type Cubic = [P, P, P, P]

type GeneratedBranch = {
  start: P
  c1: P
  c2: P
  end: P
  width: number
  /** Indexes used as seed for leaf positions (stable across renders). */
  seed: number
}

const TRUNK_X = 120
const TRUNK_TOP_Y = 168
const TRUNK_BOTTOM_Y = 250
const MIN_X = 18
const MAX_X = 222
const MIN_Y = 26
const MAX_END_Y = 274

const UPPER_COLORS = ['#7ba88a', '#8fbd9a', '#6a9577', '#a4c8aa', '#9bb88c']
const LOWER_COLORS = ['#d4a857', '#e6c074', '#c79540', '#deb079', '#b9893a']

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cubicAt(c: Cubic, t: number): P {
  const [p0, p1, p2, p3] = c
  const u = 1 - t
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ]
}

function cubicDerivative(c: Cubic, t: number): P {
  const [p0, p1, p2, p3] = c
  const u = 1 - t
  const dx =
    3 * u * u * (p1[0] - p0[0]) +
    6 * u * t * (p2[0] - p1[0]) +
    3 * t * t * (p3[0] - p2[0])
  const dy =
    3 * u * u * (p1[1] - p0[1]) +
    6 * u * t * (p2[1] - p1[1]) +
    3 * t * t * (p3[1] - p2[1])
  const len = Math.hypot(dx, dy) || 1
  return [dx / len, dy / len]
}

function rotate(v: P, angleRad: number): P {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

/** Deterministic procedural generation of N branches. Each branch attaches
 *  either to the trunk OR to an earlier branch, so the tree grows organically
 *  outward rather than always sprouting from the trunk. */
function generateBranches(seed: number, count: number): GeneratedBranch[] {
  const rng = mulberry32(seed)
  const branches: GeneratedBranch[] = []

  for (let i = 0; i < count; i++) {
    let start: P
    let parentDir: P
    let parentWidth: number

    const attachToExisting = i >= 2 && branches.length > 0 && rng() < 0.6

    if (attachToExisting) {
      // Bias toward more recent branches so the tree spreads outward.
      const bias = Math.pow(rng(), 0.55)
      const parentIdx = Math.min(
        branches.length - 1,
        Math.floor(branches.length * (0.2 + bias * 0.8))
      )
      const parent = branches[parentIdx]
      const cubic: Cubic = [parent.start, parent.c1, parent.c2, parent.end]
      const tAttach = 0.4 + rng() * 0.5
      start = cubicAt(cubic, tAttach)
      parentDir = cubicDerivative(cubic, tAttach)
      parentWidth = parent.width
    } else {
      const yRange = TRUNK_BOTTOM_Y - TRUNK_TOP_Y - 15
      const y = TRUNK_TOP_Y + 8 + rng() * yRange
      start = [TRUNK_X + (rng() - 0.5) * 4, y]
      const side = rng() < 0.5 ? -1 : 1
      const angle = side * (0.5 + rng() * 0.9) // 28–80° from vertical
      parentDir = [Math.sin(angle), -Math.cos(angle)]
      parentWidth = 5.5
    }

    // Try several directions; reject if it leaves the canvas.
    let dir: P = parentDir
    let length = 28 + rng() * 28
    let end: P = [0, 0]
    let attempts = 0
    while (attempts < 10) {
      const deviation = (rng() - 0.5) * 1.1
      dir = rotate(parentDir, deviation)
      // Bias growth slightly upward so the tree feels uplifted overall.
      if (dir[1] > 0.3 && rng() < 0.7) {
        dir = [dir[0], dir[1] * 0.4]
        const m = Math.hypot(dir[0], dir[1]) || 1
        dir = [dir[0] / m, dir[1] / m]
      }
      end = [start[0] + dir[0] * length, start[1] + dir[1] * length]
      if (
        end[0] >= MIN_X &&
        end[0] <= MAX_X &&
        end[1] >= MIN_Y &&
        end[1] <= MAX_END_Y
      ) {
        break
      }
      length = Math.max(18, length * 0.85)
      attempts++
    }

    const wiggle1 = (rng() - 0.5) * 6
    const wiggle2 = (rng() - 0.5) * 6
    const c1: P = [
      start[0] + dir[0] * length * 0.28 + wiggle1,
      start[1] + dir[1] * length * 0.28,
    ]
    const c2: P = [
      end[0] - dir[0] * length * 0.28 + wiggle2,
      end[1] - dir[1] * length * 0.28,
    ]

    const width = Math.max(1.5, parentWidth * (0.7 + rng() * 0.15))

    branches.push({ start, c1, c2, end, width, seed: 1000 + i * 31 })
  }
  return branches
}

const BRANCHES = generateBranches(42, 90)

type LeafPlacement = {
  x: number
  y: number
  rotation: number
  scale: number
}

function leavesForBranch(branch: GeneratedBranch): LeafPlacement[] {
  const rng = mulberry32(branch.seed)
  const out: LeafPlacement[] = []
  const cubic: Cubic = [branch.start, branch.c1, branch.c2, branch.end]

  // 1–4 leaves distributed along the branch (t between 0.3 and 0.85),
  // offset slightly perpendicular so they don't sit directly on the stroke.
  const middleCount = 1 + Math.floor(rng() * 4)
  for (let i = 0; i < middleCount; i++) {
    const baseT =
      middleCount === 1 ? 0.55 : 0.32 + (i / (middleCount - 1)) * 0.52
    const t = Math.max(0.28, Math.min(0.88, baseT + (rng() - 0.5) * 0.09))
    const [bx, by] = cubicAt(cubic, t)
    const dir = cubicDerivative(cubic, t)
    const perp: P = [-dir[1], dir[0]]
    const side = rng() < 0.5 ? -1 : 1
    const offset = side * (3 + rng() * 5)
    out.push({
      x: bx + perp[0] * offset,
      y: by + perp[1] * offset,
      rotation: (rng() - 0.5) * 80,
      scale: 0.85 + rng() * 0.35,
    })
  }

  // 1–3 leaves clustered at the tip.
  const tipCount = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < tipCount; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 2 + rng() * 7
    out.push({
      x: branch.end[0] + Math.cos(angle) * radius,
      y: branch.end[1] + Math.sin(angle) * radius,
      rotation: (rng() - 0.5) * 80,
      scale: 0.9 + rng() * 0.35,
    })
  }
  return out
}

function leafColorFor(log: MobilityLog, leafIndex: number): string {
  const isMixed = log.upperBody && log.lowerBody
  if (isMixed) {
    const pool = leafIndex % 2 === 0 ? UPPER_COLORS : LOWER_COLORS
    return pool[(leafIndex * 3) % pool.length]
  }
  const palette = log.upperBody ? UPPER_COLORS : LOWER_COLORS
  return palette[leafIndex % palette.length]
}

function Leaf({
  placement,
  color,
  delay,
}: {
  placement: LeafPlacement
  color: string
  delay: number
}) {
  return (
    <g
      transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotation}) scale(${placement.scale})`}
      style={{
        animation: 'leafIn 420ms ease-out both',
        animationDelay: `${delay}ms`,
      }}
    >
      <path
        d="M 0 -8 C -5.2 -8 -6.5 -1.5 0 5 C 6.5 -1.5 5.2 -8 0 -8 Z"
        fill={color}
      />
      <path
        d="M 0 -7 L 0 4"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
    </g>
  )
}

function BranchPath({ branch, delayMs }: { branch: GeneratedBranch; delayMs: number }) {
  const d = `M ${branch.start[0]} ${branch.start[1]} C ${branch.c1[0]} ${branch.c1[1]}, ${branch.c2[0]} ${branch.c2[1]}, ${branch.end[0]} ${branch.end[1]}`
  return (
    <path
      d={d}
      stroke="#7a5a3a"
      strokeWidth={branch.width}
      strokeLinecap="round"
      fill="none"
      style={{
        animation: 'leafIn 480ms ease-out both',
        animationDelay: `${delayMs}ms`,
      }}
    />
  )
}

type Props = {
  /** Kirjaukset kronologisesti, vanhin ensin. Yksi kirjaus = yksi oksa. */
  logs: MobilityLog[]
}

// HUOM: `leafIn` animoi VAIN opacityä (ks. styles/global.css). Lehdet ja oksat
// sijoitetaan SVG:n transform-attribuutilla, ja jos keyframe koskee transformia,
// Safari korvaa attribuutin CSS-arvolla ja kaikki lehdet kasautuvat origoon.
// Tämä oli Kodin viimeinen korjaus ennen siirtoa — älä lisää transformia tähän.

export function Tree({ logs }: Props) {
  const haloOpacity = Math.min(0.5, 0.05 + logs.length * 0.018)

  return (
    <svg
      viewBox="0 0 240 320"
      role="img"
      aria-label="LiikkuvuusPuu"
      className="mx-auto h-72 w-full max-w-xs"
    >
      <defs>
        <linearGradient id="bark" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#5a3f25" />
          <stop offset="55%" stopColor="#7a5a3a" />
          <stop offset="100%" stopColor="#a07a4a" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7ba88a" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#7ba88a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#7ba88a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ground" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e9dcc0" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#e9dcc0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="120" cy="292" rx="110" ry="14" fill="url(#ground)" />
      <line x1="20" y1="293" x2="220" y2="293" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />

      {logs.length > 0 ? (
        <circle cx="120" cy="100" r="100" fill="url(#halo)" opacity={haloOpacity} />
      ) : null}

      {/* trunk */}
      <path
        d="M 113 292 C 109 252, 110 215, 116 178 L 124 178 C 130 215, 131 252, 127 292 Z"
        fill="url(#bark)"
      />
      <path
        d="M 114 285 C 113 245, 114 215, 117 182"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* branches + leaves, one per log */}
      {logs.map((log, i) => {
        if (i >= BRANCHES.length) return null
        const branch = BRANCHES[i]
        const placements = leavesForBranch(branch)
        return (
          <g key={log.id}>
            <BranchPath branch={branch} delayMs={0} />
            {placements.map((p, j) => (
              <Leaf
                key={j}
                placement={p}
                color={leafColorFor(log, j)}
                delay={140 + j * 32}
              />
            ))}
          </g>
        )
      })}

      {/* seedling tufts when empty */}
      {logs.length === 0 ? (
        <path
          d="M 100 292 q 2 -8 4 -10 M 105 292 q 1 -10 2 -12 M 134 292 q 2 -10 3 -12 M 140 292 q 1 -8 3 -10"
          stroke="#9bb88c"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
      ) : null}
    </svg>
  )
}
