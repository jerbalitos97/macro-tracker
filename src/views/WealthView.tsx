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
import { C, card, errorBanner, tinyLabel } from '../lib/wealth/ui'

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: `2px solid ${C.border}`,
            borderTopColor: C.accent,
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    )
  }

  return (
    <main style={{ padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
            Wealth
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: C.muted }}>
            Portfolio + goals
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Wealth settings"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.muted,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {/* Stat cards */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={card}>
          <div style={tinyLabel}>Portfolio total</div>
          <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(portfolioValue, settings.currency)}
          </div>
          {assets.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, color: overallChange >= 0 ? C.accent : C.danger }}>
              {formatPercent(overallChange)} since start
            </div>
          )}
        </div>
        <div style={card}>
          <div style={{ ...tinyLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Wealth goal</span>
            {goalProgress !== null && <span style={{ color: C.goal }}>{goalProgress.toFixed(1)}%</span>}
          </div>
          {settings.wealthGoal !== null ? (
            <>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(settings.wealthGoal, settings.currency)}
              </div>
              <div style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: C.goal,
                    width: `${Math.min(100, Math.max(0, goalProgress ?? 0))}%`,
                    transition: 'width 0.45s ease',
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Not set — add one in Settings to see it as a chart threshold.
            </div>
          )}
        </div>
      </section>

      {error && <p style={errorBanner}>{error}</p>}

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
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
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
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ToggleChip active={showProjection} onClick={() => setShowProjection((v) => !v)} swatch="#6366f1">
            Projection
          </ToggleChip>
          {showProjection && (
            <select
              value={projectionYears}
              onChange={(e) => setProjectionYears(Number(e.target.value))}
              style={{
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                backgroundColor: C.surface,
                color: C.text,
                fontSize: 11,
                padding: '4px 8px',
                fontFamily: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
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
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tinyLabel}>Assets</div>
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
