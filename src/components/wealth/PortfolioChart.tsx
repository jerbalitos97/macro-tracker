import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Asset, ChartPoint } from '../../lib/wealth/types'
import { formatMoney } from '../../lib/wealth/format'
import { Card } from '../ui'

// recharts renders raw SVG and ignores Tailwind classes, so chart chrome
// colors are supplied as JS values that mirror the theme tokens.
const CHART_BORDER = 'rgba(255,255,255,0.07)'
const CHART_TEXT = '#eef1f6'
const CHART_MUTED = '#6a6f7a'

const ASSET_COLORS = [
  '#22d3ee', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#4ade80', '#60a5fa', '#f87171',
]
const assetColor = (i: number) => ASSET_COLORS[i % ASSET_COLORS.length]

const formatTick = (iso: string) =>
  new Date(iso).toLocaleDateString('fi-FI', { month: 'short', year: '2-digit' })

const formatYAxis = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(Math.round(v))
}

type Props = {
  data: ChartPoint[]
  assets: Asset[]
  visibleAssetIds: Set<string>
  showPortfolio: boolean
  showProjection: boolean
  wealthGoal: number | null
  currency: string
}

export default function PortfolioChart({
  data,
  assets,
  visibleAssetIds,
  showPortfolio,
  showProjection,
  wealthGoal,
  currency,
}: Props) {
  if (data.length === 0) {
    return (
      <Card variant="glass" className="flex h-[280px] items-center justify-center text-[13px] text-muted">
        Add an asset to start tracking.
      </Card>
    )
  }
  return (
    <Card variant="glass" className="p-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1c1c1c" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#444"
              tickFormatter={formatTick}
              minTickGap={32}
              tick={{ fontSize: 11 }}
            />
            <YAxis stroke="#444" tickFormatter={formatYAxis} tick={{ fontSize: 11 }} width={56} />
            <Tooltip
              contentStyle={{
                background: '#181818',
                border: `1px solid ${CHART_BORDER}`,
                borderRadius: 8,
                color: CHART_TEXT,
              }}
              labelStyle={{ color: CHART_MUTED }}
              labelFormatter={(v) => formatTick(String(v))}
              formatter={(value, name) => {
                const n = typeof value === 'number' ? value : Number(value)
                return [Number.isFinite(n) ? formatMoney(n, currency) : '—', String(name)]
              }}
            />
            {wealthGoal !== null && (
              <ReferenceLine
                y={wealthGoal}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Goal ${formatMoney(wealthGoal, currency)}`,
                  fill: '#f59e0b',
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
            )}
            {showPortfolio && (
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showPortfolio && showProjection && (
              <Line
                type="monotone"
                dataKey="portfolioProjection"
                name="Portfolio (proj.)"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {assets.map((a, i) =>
              visibleAssetIds.has(a.id) ? (
                <Line
                  key={a.id}
                  type="monotone"
                  dataKey={`asset_${a.id}`}
                  name={a.name}
                  stroke={assetColor(i)}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null,
            )}
            {showProjection &&
              assets.map((a, i) =>
                visibleAssetIds.has(a.id) ? (
                  <Line
                    key={`p_${a.id}`}
                    type="monotone"
                    dataKey={`projection_${a.id}`}
                    name={`${a.name} (proj.)`}
                    stroke={assetColor(i)}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null,
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
