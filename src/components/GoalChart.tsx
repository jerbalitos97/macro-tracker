import { fromISO, toISO } from '../lib/dates'
import type { GoalPeriod, WeightTrend } from '../types'

interface Props {
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  trendData: WeightTrend['trendData']
  /** Optional. When given, the target line becomes a staircase of one
   *  segment per period; the legacy single-segment path is kept for
   *  back-compat when periods is absent. */
  periods?: GoalPeriod[]
}

const PERIOD_COLORS: Record<string, string> = {
  cut: '#d4b85a',
  maintenance: '#6a9ad4',
  refill: '#c98ad4',
  bulk: '#8acb88',
}

export function GoalChart({
  startDate,
  endDate,
  startWeight,
  targetWeight,
  trendData,
  periods,
}: Props) {
  const W = 380
  const H = 160
  const pad = { top: 12, right: 12, bottom: 22, left: 38 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  // Effective chart window: span all periods if given, else the props.
  const segments = periods && periods.length > 0 ? periods : null
  const chartStart = segments
    ? segments.reduce((a, b) => (a.startDate <= b.startDate ? a : b)).startDate
    : startDate
  const chartEnd = segments
    ? segments.reduce((a, b) => (a.endDate >= b.endDate ? a : b)).endDate
    : endDate

  const start = fromISO(chartStart)
  const end = fromISO(chartEnd)
  const totalMs = Math.max(1, end.getTime() - start.getTime())

  const todayISO = toISO(new Date())

  const xPct = (iso: string) => {
    const d = fromISO(iso)
    return Math.max(0, Math.min(1, (d.getTime() - start.getTime()) / totalMs))
  }
  const xPos = (iso: string) => pad.left + xPct(iso) * innerW

  // Y scale: include every period endpoint + trend points + start/target
  const periodKg = segments
    ? segments.flatMap((p) => [p.startWeight, p.targetWeight])
    : [startWeight, targetWeight]
  const allKg = [...periodKg, ...trendData.map((d) => d.kg), ...trendData.map((d) => d.trend)]
  const minKg = Math.min(...allKg) - 0.5
  const maxKg = Math.max(...allKg) + 0.5
  const kgRange = maxKg - minKg

  const yPos = (kg: number) => pad.top + ((maxKg - kg) / kgRange) * innerH

  // Goal segments
  const goalSegments: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    color: string
    active: boolean
    endLabel: string
    endLabelKg: number
    endLabelX: number
  }> = []

  if (segments) {
    for (const p of segments) {
      goalSegments.push({
        x1: xPos(p.startDate),
        y1: yPos(p.startWeight),
        x2: xPos(p.endDate),
        y2: yPos(p.targetWeight),
        color: PERIOD_COLORS[p.type] ?? '#d4b85a',
        active: p.status === 'active',
        endLabel:
          p.status === 'achieved'
            ? `${p.targetWeight.toFixed(1)} ✓`
            : `${p.targetWeight.toFixed(1)}`,
        endLabelKg: p.targetWeight,
        endLabelX: xPos(p.endDate),
      })
    }
  } else {
    goalSegments.push({
      x1: pad.left,
      y1: yPos(startWeight),
      x2: pad.left + innerW,
      y2: yPos(targetWeight),
      color: '#d4b85a',
      active: true,
      endLabel: `${targetWeight.toFixed(1)}`,
      endLabelKg: targetWeight,
      endLabelX: pad.left + innerW,
    })
  }

  // Actual trend path (only dates within chart range)
  const inRange = trendData.filter((d) => d.date >= chartStart && d.date <= chartEnd)
  const trendPath =
    inRange.length >= 2
      ? inRange
          .map((d, i) => {
            const x = xPos(d.date).toFixed(1)
            const y = yPos(d.trend).toFixed(1)
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          })
          .join(' ')
      : null

  // Today vertical line (only if within range)
  const todayInRange = todayISO >= chartStart && todayISO <= chartEnd
  const todayX = todayInRange ? xPos(todayISO) : null

  // Y-axis labels
  const yLabels = [maxKg, (maxKg + minKg) / 2, minKg]

  // Axis / label font — var() so it picks up the theme token
  const monoFont = "ui-monospace, 'SF Mono', monospace"

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {/* Y-axis labels */}
      {yLabels.map((kg, i) => (
        <text
          key={i}
          x={pad.left - 5}
          y={yPos(kg) + 3}
          fill="var(--color-muted)"
          fontSize="8.5"
          textAnchor="end"
          fontFamily={monoFont}
        >
          {kg.toFixed(1)}
        </text>
      ))}

      {/* Grid lines */}
      {yLabels.map((kg, i) => (
        <line
          key={i}
          x1={pad.left}
          y1={yPos(kg)}
          x2={W - pad.right}
          y2={yPos(kg)}
          stroke="#1c1c1c"
          strokeWidth="1"
        />
      ))}

      {/* Today marker */}
      {todayX !== null && (
        <line
          x1={todayX}
          y1={pad.top}
          x2={todayX}
          y2={H - pad.bottom}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      )}

      {/* Goal segments — one per period, faded if retired */}
      {goalSegments.map((g, i) => (
        <g key={i}>
          <line
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={g.color}
            strokeWidth={g.active ? '2' : '1.5'}
            strokeDasharray="5,3"
            opacity={g.active ? 0.7 : 0.35}
          />
          {/* End-of-segment tick + label */}
          <circle cx={g.x2} cy={g.y2} r="2.2" fill={g.color} opacity={g.active ? 0.85 : 0.4} />
        </g>
      ))}

      {/* Raw weight dots */}
      {inRange.map((d, i) => (
        <circle key={i} cx={xPos(d.date)} cy={yPos(d.kg)} r="1.8" fill="#3a3a3a" />
      ))}

      {/* Actual trend line (solid gold) */}
      {trendPath && (
        <path d={trendPath} fill="none" stroke="#d4b85a" strokeWidth="2.2" strokeLinejoin="round" />
      )}

      {/* Latest trend dot */}
      {inRange.length > 0 && (
        <circle
          cx={xPos(inRange[inRange.length - 1].date)}
          cy={yPos(inRange[inRange.length - 1].trend)}
          r="3.5"
          fill="#d4b85a"
        />
      )}

      {/* X-axis date labels */}
      <text
        x={pad.left}
        y={H - 4}
        fill="var(--color-muted)"
        fontSize="8.5"
        fontFamily={monoFont}
      >
        {chartStart.slice(5)}
      </text>
      <text
        x={W - pad.right}
        y={H - 4}
        fill="var(--color-muted)"
        fontSize="8.5"
        textAnchor="end"
        fontFamily={monoFont}
      >
        {chartEnd.slice(5)}
      </text>
      {todayX !== null && (
        <text
          x={todayX}
          y={H - 4}
          fill="rgba(255,255,255,0.25)"
          fontSize="8"
          textAnchor="middle"
          fontFamily={monoFont}
        >
          tänään
        </text>
      )}

      {/* Legend */}
      <line x1={W - 90} y1={pad.top + 4} x2={W - 78} y2={pad.top + 4} stroke="#d4b85a" strokeWidth="1.5" strokeDasharray="4,2" opacity="0.55" />
      <text x={W - 75} y={pad.top + 7} fill="#555" fontSize="8" fontFamily={monoFont}>tavoitelinja</text>
      <line x1={W - 90} y1={pad.top + 14} x2={W - 78} y2={pad.top + 14} stroke="#d4b85a" strokeWidth="2" />
      <text x={W - 75} y={pad.top + 17} fill="#555" fontSize="8" fontFamily={monoFont}>trendi</text>
    </svg>
  )
}
