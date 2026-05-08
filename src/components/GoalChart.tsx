import { fromISO, toISO } from '../lib/dates'
import type { WeightTrend } from '../types'

interface Props {
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  trendData: WeightTrend['trendData']
}

export function GoalChart({ startDate, endDate, startWeight, targetWeight, trendData }: Props) {
  const W = 380
  const H = 160
  const pad = { top: 12, right: 12, bottom: 22, left: 38 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const start = fromISO(startDate)
  const end = fromISO(endDate)
  const totalMs = Math.max(1, end.getTime() - start.getTime())

  const todayISO = toISO(new Date())

  const xPct = (iso: string) => {
    const d = fromISO(iso)
    return Math.max(0, Math.min(1, (d.getTime() - start.getTime()) / totalMs))
  }
  const xPos = (iso: string) => pad.left + xPct(iso) * innerW

  // Y scale: include start/target weights + all trend points + a small margin
  const allKg = [startWeight, targetWeight, ...trendData.map((d) => d.kg), ...trendData.map((d) => d.trend)]
  const minKg = Math.min(...allKg) - 0.5
  const maxKg = Math.max(...allKg) + 0.5
  const kgRange = maxKg - minKg

  const yPos = (kg: number) => pad.top + ((maxKg - kg) / kgRange) * innerH

  // Goal line: two points — start of cut and end of cut
  const gx1 = pad.left
  const gy1 = yPos(startWeight)
  const gx2 = pad.left + innerW
  const gy2 = yPos(targetWeight)

  // Actual trend path (only dates within chart range)
  const inRange = trendData.filter((d) => d.date >= startDate && d.date <= endDate)
  const trendPath = inRange.length >= 2
    ? inRange
        .map((d, i) => {
          const x = xPos(d.date).toFixed(1)
          const y = yPos(d.trend).toFixed(1)
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
        })
        .join(' ')
    : null

  // Today vertical line (only if within range)
  const todayInRange = todayISO >= startDate && todayISO <= endDate
  const todayX = todayInRange ? xPos(todayISO) : null

  // Y-axis labels
  const yLabels = [maxKg, (maxKg + minKg) / 2, minKg]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Y-axis labels */}
      {yLabels.map((kg, i) => (
        <text
          key={i}
          x={pad.left - 5}
          y={yPos(kg) + 3}
          fill="#444"
          fontSize="8.5"
          textAnchor="end"
          fontFamily="ui-monospace, 'SF Mono', monospace"
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

      {/* Goal line (dashed gold) */}
      <line
        x1={gx1}
        y1={gy1}
        x2={gx2}
        y2={gy2}
        stroke="#d4b85a"
        strokeWidth="1.5"
        strokeDasharray="5,3"
        opacity="0.55"
      />

      {/* Raw weight dots */}
      {inRange.map((d, i) => (
        <circle
          key={i}
          cx={xPos(d.date)}
          cy={yPos(d.kg)}
          r="1.8"
          fill="#3a3a3a"
        />
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
        fill="#444"
        fontSize="8.5"
        fontFamily="ui-monospace, 'SF Mono', monospace"
      >
        {startDate.slice(5)}
      </text>
      <text
        x={W - pad.right}
        y={H - 4}
        fill="#444"
        fontSize="8.5"
        textAnchor="end"
        fontFamily="ui-monospace, 'SF Mono', monospace"
      >
        {endDate.slice(5)}
      </text>
      {todayX !== null && (
        <text
          x={todayX}
          y={H - 4}
          fill="rgba(255,255,255,0.25)"
          fontSize="8"
          textAnchor="middle"
          fontFamily="ui-monospace, 'SF Mono', monospace"
        >
          tänään
        </text>
      )}

      {/* Legend */}
      <line x1={W - 90} y1={pad.top + 4} x2={W - 78} y2={pad.top + 4} stroke="#d4b85a" strokeWidth="1.5" strokeDasharray="4,2" opacity="0.55" />
      <text x={W - 75} y={pad.top + 7} fill="#555" fontSize="8" fontFamily="ui-monospace, 'SF Mono', monospace">tavoitelinja</text>
      <line x1={W - 90} y1={pad.top + 14} x2={W - 78} y2={pad.top + 14} stroke="#d4b85a" strokeWidth="2" />
      <text x={W - 75} y={pad.top + 17} fill="#555" fontSize="8" fontFamily="ui-monospace, 'SF Mono', monospace">trendi</text>
    </svg>
  )
}
