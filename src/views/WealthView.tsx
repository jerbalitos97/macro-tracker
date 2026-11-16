import { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import PortfolioChart from '../components/wealth/PortfolioChart'
import AssetCard from '../components/wealth/AssetCard'
import AddAssetForm from '../components/wealth/AddAssetForm'
import ToggleChip from '../components/wealth/ToggleChip'
import { deleteAsset, listAssets, listAllValues, reorderAssets } from '../lib/wealth/assets'
import { getSettings } from '../lib/wealth/settings'
import {
  buildChartData,
  currentAssetValue,
  currentPortfolioValue,
} from '../lib/wealth/projection'
import { formatMoney, formatPercent } from '../lib/wealth/format'
import type { Asset, AssetValue, Settings } from '../lib/wealth/types'
import { Button, Card, Chip, DragItem, useDragReorder, moveById, moveByDelta, snack } from '../components/ui'

const label = 'text-[12px] leading-4 text-fg-muted'
const errorBanner =
  'rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger'
const textBtn =
  'inline-flex min-h-11 items-center rounded-full bg-transparent px-3 text-[14px] font-semibold text-[#22d3ee]'
/** How long a deleted asset waits for "Undo" before it is really deleted.
 *  A little over the snackbar's 5 s so the button never outlives the chance. */
const DELETE_GRACE_MS = 5200

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
  // What-if scenario: excluded assets are dropped from every portfolio and
  // projection calculation, as if they didn't exist (or produced nothing).
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  // Deleted but still undoable: hidden everywhere on this screen, deleted in
  // the database only once the undo window has passed.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())

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

  // Reordering is optimistic: the list re-renders straight away and the new
  // positions go to the database behind it. A failed write reloads the server's
  // order rather than leaving the screen lying about it.
  const applyAssetOrder = (next: Asset[]) => {
    if (next === assets) return
    setAssets(next)
    reorderAssets(next.map((a) => a.id)).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to save order')
      void refresh()
    })
  }

  function removeAsset(a: Asset) {
    const unhide = () =>
      setPendingDeleteIds((prev) => {
        const next = new Set(prev)
        next.delete(a.id)
        return next
      })
    setPendingDeleteIds((prev) => new Set(prev).add(a.id))
    const timer = window.setTimeout(() => {
      deleteAsset(a.id)
        .then(refresh)
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to delete')
          unhide()
        })
    }, DELETE_GRACE_MS)
    snack({
      text: `Deleted ${a.name}`,
      actionLabel: 'Undo',
      onAction: () => {
        window.clearTimeout(timer)
        unhide()
      },
    })
  }

  const shownAssets = useMemo(
    () => assets.filter((a) => !pendingDeleteIds.has(a.id)),
    [assets, pendingDeleteIds],
  )

  const assetDrag = useDragReorder((fromId, toId) => applyAssetOrder(moveById(assets, fromId, toId)))

  const includedAssets = useMemo(
    () => shownAssets.filter((a) => !excludedIds.has(a.id)),
    [shownAssets, excludedIds],
  )

  const portfolioValue = useMemo(
    () => currentPortfolioValue(includedAssets, values),
    [includedAssets, values],
  )

  const initialPortfolioValue = useMemo(() => {
    const byAsset = new Map<string, AssetValue[]>()
    for (const a of includedAssets) byAsset.set(a.id, [])
    for (const v of values) byAsset.get(v.assetId)?.push(v)
    let total = 0
    for (const arr of byAsset.values()) {
      if (arr.length === 0) continue
      const sorted = [...arr].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      total += sorted[0].value
    }
    return total
  }, [includedAssets, values])

  const overallChange =
    initialPortfolioValue > 0 ? ((portfolioValue - initialPortfolioValue) / initialPortfolioValue) * 100 : 0
  const goalProgress =
    settings.wealthGoal && settings.wealthGoal > 0 ? (portfolioValue / settings.wealthGoal) * 100 : null

  const chartData = useMemo(
    () => buildChartData({ assets: includedAssets, values, showProjection, projectionYears }),
    [includedAssets, values, showProjection, projectionYears],
  )

  function toggleAsset(id: string) {
    setVisibleAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExcluded(id: string) {
    setExcludedIds((prev) => {
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

  const goalPct = Math.min(100, Math.max(0, goalProgress ?? 0))

  return (
    <main className="flex flex-col gap-3 px-4 pb-10 pt-2">
      {/* Hero: the screen's one big number */}
      <section
        className="relative flex flex-col gap-1.5 border border-[rgba(52,211,153,0.35)] p-[22px]"
        style={{
          borderRadius: '36px 36px 36px 12px',
          background: 'linear-gradient(135deg, rgba(52,211,153,0.28), rgba(34,211,238,0.22))',
        }}
      >
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Wealth settings"
          className="absolute right-2 top-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-transparent text-[#d1fae5]"
        >
          <SettingsIcon size={20} />
        </button>
        <span className="pr-12 text-[14px] leading-5 text-[#d1fae5]">
          Portfolio total{excludedIds.size > 0 ? ' · scenario' : ''}
        </span>
        <span className="num-display text-[52px] leading-[56px]">
          {formatMoney(portfolioValue, settings.currency)}
        </span>
        {shownAssets.length > 0 && (
          <span className={`text-[15px] ${overallChange >= 0 ? 'text-[#bbf7d0]' : 'text-danger'}`}>
            {formatPercent(overallChange)} since start
          </span>
        )}
        {settings.wealthGoal !== null ? (
          <>
            <div className="mt-2 flex justify-between text-[14px] text-[#d1fae5]">
              <span>Wealth goal {formatMoney(settings.wealthGoal, settings.currency)}</span>
              {goalProgress !== null && <span className="font-mono">{goalProgress.toFixed(1)} %</span>}
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-[5px] bg-white/[0.14]"
              role="progressbar"
              aria-label="Wealth goal progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(goalPct)}
            >
              <div
                className="h-2.5 rounded-[5px] bg-gradient-to-r from-[#34d399] to-[#22d3ee] transition-[width] duration-500 ease-out"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </>
        ) : (
          <span className="mt-2 text-[14px] leading-5 text-[#d1fae5]">
            No wealth goal yet — set one in settings to see progress here and on the chart.
          </span>
        )}
      </section>

      {error && <p className={errorBanner}>{error}</p>}

      <Card className="flex flex-col gap-2.5 !p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[16px] font-medium leading-6 text-text">Portfolio</span>
          <Chip
            type="button"
            active={showProjection}
            aria-pressed={showProjection}
            onClick={() => setShowProjection((v) => !v)}
            className="!min-h-9"
          >
            Projection
          </Chip>
        </div>
        {showProjection && (
          <div
            role="radiogroup"
            aria-label="Projection timeframe"
            className="grid grid-cols-5 overflow-hidden rounded-[20px] border border-white/[0.18]"
          >
            {TIMEFRAMES.map((t, k) => {
              const on = projectionYears === t.years
              return (
                <button
                  key={t.years}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setProjectionYears(t.years)}
                  className={`min-h-10 text-[14px] font-medium ${k ? 'border-l border-white/[0.18]' : ''} ${
                    on ? 'bg-[rgba(52,211,153,0.2)] text-[#bbf7d0]' : 'bg-transparent text-text'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        <PortfolioChart
          data={chartData}
          assets={shownAssets}
          visibleAssetIds={visibleAssetIds}
          showPortfolio={showPortfolio}
          showProjection={showProjection}
          wealthGoal={settings.wealthGoal}
          currency={settings.currency}
        />

        {/* Which lines the chart draws */}
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip active={showPortfolio} onClick={() => setShowPortfolio((v) => !v)} swatch="#10b981">
            Portfolio
          </ToggleChip>
          {shownAssets.map((a, i) => (
            <ToggleChip
              key={a.id}
              active={visibleAssetIds.has(a.id)}
              onClick={() => toggleAsset(a.id)}
              swatch={ASSET_COLORS[i % ASSET_COLORS.length]}
            >
              {a.name}
            </ToggleChip>
          ))}
        </div>

        {/* What-if scenario: exclude assets from all calculations */}
        {shownAssets.length > 0 && (
          <>
            <span className={`${label} mt-1`}>What-if · exclude from calculations</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {shownAssets.map((a) => {
                const off = excludedIds.has(a.id)
                return (
                  <Chip
                    key={a.id}
                    type="button"
                    aria-pressed={off}
                    onClick={() => toggleExcluded(a.id)}
                    className={`!min-h-9 ${off ? '!text-[#899294] line-through' : '!text-text'}`}
                  >
                    {a.name}
                  </Chip>
                )
              })}
              {excludedIds.size > 0 && (
                <button type="button" onClick={() => setExcludedIds(new Set())} className={textBtn}>
                  Reset
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Assets list */}
      <div className="flex items-center justify-between px-1 pt-1">
        <h2 className="text-[16px] font-medium leading-6 text-text">Assets</h2>
        {!adding && (
          <Button type="button" variant="action" className="flex-none" onClick={() => setAdding(true)}>
            + Add asset
          </Button>
        )}
      </div>
      <AddAssetForm open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
      <div ref={assetDrag.containerRef} className="flex flex-col gap-3">
        {shownAssets.map((a, i) => {
          const sortedOwn = values
            .filter((v) => v.assetId === a.id)
            .sort((x, y) => x.recordedAt.localeCompare(y.recordedAt))
          return (
            <DragItem
              key={a.id}
              id={a.id}
              reorder={assetDrag}
              longPress
              onMove={(d) => applyAssetOrder(moveByDelta(assets, a.id, d))}
              tabIndex={0}
              ariaLabel={`${a.name} — pidä pohjassa järjestääksesi`}
              className="rounded-panel"
            >
              <div style={{ opacity: excludedIds.has(a.id) ? 0.5 : 1 }}>
                <AssetCard
                  asset={a}
                  currentValue={currentAssetValue(a.id, values)}
                  initialValue={sortedOwn[0]?.value ?? null}
                  visible={visibleAssetIds.has(a.id)}
                  swatch={ASSET_COLORS[i % ASSET_COLORS.length]}
                  currency={settings.currency}
                  onToggle={() => toggleAsset(a.id)}
                  onChange={refresh}
                  onDelete={() => removeAsset(a)}
                />
              </div>
            </DragItem>
          )
        })}
      </div>
    </main>
  )
}
