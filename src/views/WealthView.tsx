import { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import PortfolioChart from '../components/wealth/PortfolioChart'
import AssetCard from '../components/wealth/AssetCard'
import AddAssetForm from '../components/wealth/AddAssetForm'
import ToggleChip from '../components/wealth/ToggleChip'
import { listAssets, listAllValues } from '../lib/wealth/assets'
import { getSettings } from '../lib/wealth/settings'
import {
  buildChartData,
  currentAssetValue,
  currentPortfolioValue,
} from '../lib/wealth/projection'
import { formatMoney, formatPercent } from '../lib/wealth/format'
import type { Asset, AssetValue, Settings } from '../lib/wealth/types'
import { Card } from '../components/ui'

const tinyLabel = 'text-[10px] font-medium uppercase tracking-[0.12em] text-muted font-mono'
const errorBanner =
  'rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger'

const ASSET_COLORS = [
  '#22d3ee', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#4ade80', '#60a5fa', '#f87171',
]
const TIMEFRAMES: Array<{ label: string; years: number }> = [
  { label: '1y', years: 1 },
  { label: '3y', years: 3 },
  { label: '5y', years: 5 },
  { label: '10y', years: 10 },
  { label: '20y', years: 20 },
]

interface Props {
  onOpenSettings: () => void
}

export function WealthView({ onOpenSettings }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [values, setValues] = useState<AssetValue[]>([])
  const [settings, setSettings] = useState<Settings>({ wealthGoal: null, currency: 'EUR' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPortfolio, setShowPortfolio] = useState(true)
  const [visibleAssetIds, setVisibleAssetIds] = useState<Set<string>>(new Set())
  const [showProjection, setShowProjection] = useState(false)
  const [projectionYears, setProjectionYears] = useState(5)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [a, v, s] = await Promise.all([listAssets(), listAllValues(), getSettings()])
      setAssets(a)
      setValues(v)
      setSettings(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const portfolioValue = useMemo(() => currentPortfolioValue(assets, values), [assets, values])

  const initialPortfolioValue = useMemo(() => {
    const byAsset = new Map<string, AssetValue[]>()
    for (const a of assets) byAsset.set(a.id, [])
    for (const v of values) byAsset.get(v.assetId)?.push(v)
    let total = 0
    for (const arr of byAsset.values()) {
      if (arr.length === 0) continue
      const sorted = [...arr].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      total += sorted[0].value
    }
    return total
  }, [assets, values])

  const overallChange =
    initialPortfolioValue > 0 ? ((portfolioValue - initialPortfolioValue) / initialPortfolioValue) * 100 : 0
  const goalProgress =
    settings.wealthGoal && settings.wealthGoal > 0 ? (portfolioValue / settings.wealthGoal) * 100 : null

  const chartData = useMemo(
    () => buildChartData({ assets, values, showProjection, projectionYears }),
    [assets, values, showProjection, projectionYears],
  )

  function toggleAsset(id: string) {
    setVisibleAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="h-9 w-9 rounded-full border-2 border-border"
          style={{ borderTopColor: '#22d3ee', animation: 'spin 1s linear infinite' }}
        />
      </div>
    )
  }

  return (
    <main className="flex flex-col gap-4 px-4 pb-10 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-text">
            Wealth
          </h1>
          <p className="mt-1 text-[11px] text-muted">
            Portfolio + goals
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Wealth settings"
          className="inline-flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full border border-border bg-transparent p-0 text-muted"
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-2.5">
        <Card variant="glass">
          <div className={tinyLabel}>Portfolio total</div>
          <div className="mt-1 font-display text-[24px] font-bold tabular-nums tracking-[-0.02em] text-text">
            {formatMoney(portfolioValue, settings.currency)}
          </div>
          {assets.length > 0 && (
            <div className={`mt-1 text-xs ${overallChange >= 0 ? 'text-[#34d399]' : 'text-danger'}`}>
              {formatPercent(overallChange)} since start
            </div>
          )}
        </Card>
        <Card variant="glass">
          <div className={`${tinyLabel} flex items-baseline justify-between`}>
            <span>Wealth goal</span>
            {goalProgress !== null && <span className="text-goal">{goalProgress.toFixed(1)}%</span>}
          </div>
          {settings.wealthGoal !== null ? (
            <>
              <div className="mt-1 font-display text-[24px] font-bold tabular-nums tracking-[-0.02em] text-text">
                {formatMoney(settings.wealthGoal, settings.currency)}
              </div>
              <div className="mt-2.5 h-1.5 rounded-[3px] bg-white/[0.06]">
                <div
                  className="h-1.5 rounded-[3px] bg-goal transition-[width] duration-[450ms] ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, goalProgress ?? 0))}%` }}
                />
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-xs leading-relaxed text-muted">
              Not set — add one in Settings to see it as a chart threshold.
            </div>
          )}
        </Card>
      </section>

      {error && <p className={errorBanner}>{error}</p>}

      <PortfolioChart
        data={chartData}
        assets={assets}
        visibleAssetIds={visibleAssetIds}
        showPortfolio={showPortfolio}
        showProjection={showProjection}
        wealthGoal={settings.wealthGoal}
        currency={settings.currency}
      />

      {/* Toggle chips row */}
      <section className="flex w-full flex-wrap items-center gap-1.5">
        <ToggleChip active={showPortfolio} onClick={() => setShowPortfolio((v) => !v)} swatch="#10b981">
          Portfolio
        </ToggleChip>
        {assets.map((a, i) => (
          <ToggleChip
            key={a.id}
            active={visibleAssetIds.has(a.id)}
            onClick={() => toggleAsset(a.id)}
            swatch={ASSET_COLORS[i % ASSET_COLORS.length]}
          >
            {a.name}
          </ToggleChip>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <ToggleChip active={showProjection} onClick={() => setShowProjection((v) => !v)} swatch="#6366f1">
            Projection
          </ToggleChip>
          {showProjection && (
            <select
              value={projectionYears}
              onChange={(e) => setProjectionYears(Number(e.target.value))}
              className="cursor-pointer rounded-full border border-border bg-surface px-2 py-1 text-[11px] text-text [color-scheme:dark]"
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.years} value={t.years}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </span>
      </section>

      {/* Assets list */}
      <section className="flex flex-col gap-2.5">
        <div className={tinyLabel}>Assets</div>
        {assets.map((a, i) => {
          const sortedOwn = values
            .filter((v) => v.assetId === a.id)
            .sort((x, y) => x.recordedAt.localeCompare(y.recordedAt))
          return (
            <AssetCard
              key={a.id}
              asset={a}
              currentValue={currentAssetValue(a.id, values)}
              initialValue={sortedOwn[0]?.value ?? null}
              visible={visibleAssetIds.has(a.id)}
              swatch={ASSET_COLORS[i % ASSET_COLORS.length]}
              currency={settings.currency}
              onToggle={() => toggleAsset(a.id)}
              onChange={refresh}
            />
          )
        })}
        <AddAssetForm onAdded={refresh} />
      </section>
    </main>
  )
}
