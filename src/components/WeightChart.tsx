import type { Settings, WeightTrend } from '../types'
import { fromISO, formatDateShort } from '../lib/dates'

interface Props {
  trendData: WeightTrend['trendData']
  settings: Settings
}

export function WeightChart({ trendData, settings }: Props) {
  if (trendData.length < 2) return null

  const w = 380
  const h = 140
  const pad = { top: 10, right: 10, bottom: 20, left: 36 }
  const innerW = w - pad.left - pad.right
  const innerH = h - pad.top - pad.bottom

  const allValues = trendData.flatMap((d) => [d.kg, d.trend])
  allValues.push(settings.targetWeight, settings.startWeight)
  const minY = Math.min(...allValues) - 0.3
  const maxY = Math.max(...allValues) + 0.3
  const yRange = maxY - minY

  const firstDate = fromISO(trendData[0].date)
  const lastDate = fromISO(trendData[trendData.length - 1].date)
  const totalDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000))

  const xPos = (dateISO: string) => {
    const d = fromISO(dateISO)
    const days = Math.round((d.getTime() - firstDate.getTime()) / 86400000)
    return pad.left + (days / totalDays) * innerW
  }
  const yPos = (kg: number) => pad.top + ((maxY - kg) / yRange) * innerH

  const trendPath = trendData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(d.date).toFixed(1)} ${yPos(d.trend).toFixed(1)}`)
    .join(' ')

  const targetY = yPos(settings.targetWeight)
  const showTarget = settings.targetWeight >= minY && settings.targetWeight <= maxY
  const last = trendData[trendData.length - 1]

  // Dynamic color refs via CSS custom properties (set in @theme)
  const accentColor = 'var(--color-accent)'
  const gridColor = 'rgba(255,255,255,0.06)'
  const dotColor = '#444'
  const labelColor = 'var(--color-muted)'

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2 h-auto w-full"
    >
      {/* Y-axis labels */}
      <text x={pad.left - 6} y={pad.top + 4} fill={labelColor} fontSize="9" textAnchor="end" fontFamily="ui-monospace">
        {maxY.toFixed(1)}
      </text>
      <text x={pad.left - 6} y={h - pad.bottom + 2} fill={labelColor} fontSize="9" textAnchor="end" fontFamily="ui-monospace">
        {minY.toFixed(1)}
      </text>

      {/* Grid lines */}
      <line x1={pad.left} y1={pad.top} x2={w - pad.right} y2={pad.top} stroke={gridColor} strokeWidth="1" />
      <line x1={pad.left} y1={h - pad.bottom} x2={w - pad.right} y2={h - pad.bottom} stroke={gridColor} strokeWidth="1" />

      {/* Target weight line */}
      {showTarget && (
        <>
          <line
            x1={pad.left} y1={targetY} x2={w - pad.right} y2={targetY}
            stroke={accentColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
          />
          <text x={w - pad.right} y={targetY - 3} fill={accentColor} fontSize="9" textAnchor="end" fontFamily="ui-monospace">
            tavoite {settings.targetWeight}
          </text>
        </>
      )}

      {/* Raw weight dots */}
      {trendData.map((d, i) => (
        <circle key={i} cx={xPos(d.date)} cy={yPos(d.kg)} r="2" fill={dotColor} />
      ))}

      {/* Trend line */}
      <path d={trendPath} fill="none" stroke={accentColor} strokeWidth="2" />
      <circle cx={xPos(last.date)} cy={yPos(last.trend)} r="3" fill={accentColor} />

      {/* X-axis date labels */}
      <text x={pad.left} y={h - 4} fill={labelColor} fontSize="9" fontFamily="ui-monospace">
        {formatDateShort(trendData[0].date)}
      </text>
      <text x={w - pad.right} y={h - 4} fill={labelColor} fontSize="9" textAnchor="end" fontFamily="ui-monospace">
        {formatDateShort(last.date)}
      </text>
    </svg>
  )
}
