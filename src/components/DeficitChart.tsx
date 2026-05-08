import { fromISO, toISO } from '../lib/dates'

interface Props {
  startDate: string
  endDate: string
  totalDeficitTarget: number
  cumulativePoints: Array<{ date: string; cum: number }>
}

const fmtKcal = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`
  return Math.round(v).toString()
}

export function DeficitChart({ startDate, endDate, totalDeficitTarget, cumulativePoints }: Props) {
  const W = 380
  const H = 160
  const pad = { top: 12, right: 12, bottom: 22, left: 50 }
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

  const cumValues = cumulativePoints.map((p) => p.cum)
  const maxCum = Math.max(totalDeficitTarget, ...cumValues, 0)
  const minCum = Math.min(0, ...cumValues)
  const yRange = Math.max(1, maxCum - minCum)
  const yPos = (kcal: number) => pad.top + ((maxCum - kcal) / yRange) * innerH

  // Target line: 0 at start → totalDeficitTarget at end
  const tx1 = pad.left
  const ty1 = yPos(0)
  const tx2 = pad.left + innerW
  const ty2 = yPos(totalDeficitTarget)

  const inRange = cumulativePoints.filter((p) => p.date >= startDate && p.date <= endDate)
  const trendPath =
    inRange.length >= 2
      ? inRange
          .map((p, i) => {
            const x = xPos(p.date).toFixed(1)
            const y = yPos(p.cum).toFixed(1)
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          })
          .join(' ')
      : null

  const todayInRange = todayISO >= startDate && todayISO <= endDate
  const todayX = todayInRange ? xPos(todayISO) : null

  const yLabels = [maxCum, (maxCum + minCum) / 2, minCum]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {yLabels.map((v, i) => (
        <text
          key={i}
          x={pad.left - 5}
          y={yPos(v) + 3}
          fill="#444"
          fontSize="8.5"
          textAnchor="end"
          fontFamily="ui-monospace, 'SF Mono', monospace"
        >
          {fmtKcal(v)}
        </text>
      ))}

      {yLabels.map((v, i) => (
        <line
          key={i}
          x1={pad.left}
          y1={yPos(v)}
          x2={W - pad.right}
          y2={yPos(v)}
          stroke="#1c1c1c"
          strokeWidth="1"
        />
      ))}

      {minCum < 0 && (
        <line
          x1={pad.left}
          y1={yPos(0)}
          x2={W - pad.right}
          y2={yPos(0)}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
        />
      )}

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

      {/* Target line */}
      <line
        x1={tx1}
        y1={ty1}
        x2={tx2}
        y2={ty2}
        stroke="#d4b85a"
        strokeWidth="1.5"
        strokeDasharray="5,3"
        opacity="0.55"
      />

      {/* Logged-day dots */}
      {inRange.map((p, i) => (
        <circle key={i} cx={xPos(p.date)} cy={yPos(p.cum)} r="1.8" fill="#3a3a3a" />
      ))}

      {/* Cumulative path */}
      {trendPath && (
        <path d={trendPath} fill="none" stroke="#d4b85a" strokeWidth="2.2" strokeLinejoin="round" />
      )}

      {/* Latest dot */}
      {inRange.length > 0 && (
        <circle
          cx={xPos(inRange[inRange.length - 1].date)}
          cy={yPos(inRange[inRange.length - 1].cum)}
          r="3.5"
          fill="#d4b85a"
        />
      )}

      {/* X-axis labels */}
      <text x={pad.left} y={H - 4} fill="#444" fontSize="8.5" fontFamily="ui-monospace, 'SF Mono', monospace">
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
      <line
        x1={W - 95}
        y1={pad.top + 4}
        x2={W - 83}
        y2={pad.top + 4}
        stroke="#d4b85a"
        strokeWidth="1.5"
        strokeDasharray="4,2"
        opacity="0.55"
      />
      <text x={W - 80} y={pad.top + 7} fill="#555" fontSize="8" fontFamily="ui-monospace, 'SF Mono', monospace">
        tavoitelinja
      </text>
      <line
        x1={W - 95}
        y1={pad.top + 14}
        x2={W - 83}
        y2={pad.top + 14}
        stroke="#d4b85a"
        strokeWidth="2"
      />
      <text x={W - 80} y={pad.top + 17} fill="#555" fontSize="8" fontFamily="ui-monospace, 'SF Mono', monospace">
        toteutunut
      </text>
    </svg>
  )
}
