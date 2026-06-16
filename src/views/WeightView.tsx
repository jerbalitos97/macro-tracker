import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { WeightEntry, Meal, Settings } from '../types'
import { toISO, addDays, formatDateShort, daysBetween } from '../lib/dates'
import { parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { computeWeightTrend, estimateTdeeAdjustment } from '../lib/weight'
import { WeightChart } from '../components/WeightChart'
import { ProgressBar } from '../components/ProgressBar'
import { Card, Button, Field } from '../components/ui'

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const sectionLabel = 'mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

interface Props {
  weights: WeightEntry[]
  onAddWeight: (w: Omit<WeightEntry, 'id'>) => void
  onDeleteWeight: (id: number) => void
  onToggleExclude: (id: number) => void
  settings: Settings
  meals: Meal[]
}

export function WeightView({
  weights,
  onAddWeight,
  onDeleteWeight,
  onToggleExclude,
  settings,
  meals,
}: Props) {
  const [form, setForm] = useState({ date: toISO(new Date()), kg: '' })
  const [showAll, setShowAll] = useState(false)

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const tdeeEval = useMemo(
    () => estimateTdeeAdjustment(weights, meals, settings),
    [weights, meals, settings]
  )

  const handleAdd = () => {
    const kg = parsePositiveDecimal(form.kg)
    if (!kg || kg <= 0) return
    onAddWeight({ date: form.date, kg, excludeFromTrend: false })
    setForm({ date: toISO(new Date()), kg: '' })
  }

  const sortedWeights = [...weights].sort((a, b) => b.date.localeCompare(a.date))
  const displayedWeights = showAll ? sortedWeights : sortedWeights.slice(0, 10)

  // IDs currently feeding the displayed "Liukuva keskiarvo (7 pv)" — the latest
  // 7 non-excluded entries. Highlight those so the user sees which weigh-ins
  // are actively shaping the number.
  const activeAvgIds = useMemo(() => {
    const lastSeven = [...weights]
      .filter((w) => !w.excludeFromTrend)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)
    return new Set(lastSeven.map((w) => w.id))
  }, [weights])

  const projectedDate = useMemo(() => {
    if (!trend.currentTrend || !trend.weeklyChange || trend.weeklyChange >= 0) return null
    const kgToLose = trend.currentTrend - settings.targetWeight
    if (kgToLose <= 0) return 'saavutettu'
    const weeksNeeded = kgToLose / Math.abs(trend.weeklyChange)
    return addDays(toISO(new Date()), Math.round(weeksNeeded * 7))
  }, [trend, settings.targetWeight])

  const targetWeeklyRate = (
    ((settings.startWeight - settings.targetWeight) /
      (daysBetween(settings.startDate, settings.endDate) + 1)) * 7
  ).toFixed(2)

  return (
    <div className="px-4 pb-2 pt-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="font-display text-[24px] font-bold tracking-[-0.03em] text-text">Paino</div>
        <div className="mt-[3px] text-[11px] uppercase tracking-[0.1em] text-muted">7 pv liukuva trendi</div>
      </div>

      {/* ── Trend card ──────────────────────────────────────────────── */}
      <Card variant="glass">
        <div className={cardLabel}>Liukuva keskiarvo (7 pv)</div>
        {trend.currentTrend ? (
          <div className="flex items-end justify-between">
            <div>
              <span className="font-display text-[42px] font-extrabold tabular-nums leading-none tracking-[-0.04em] text-text">
                {trend.currentTrend.toFixed(2)}
              </span>
              <span className="ml-1 text-sm font-normal text-muted">kg</span>
            </div>
            {trend.weeklyChange !== null && (
              <div className="pb-1 text-right">
                <div className={`text-[20px] font-bold tabular-nums tracking-[-0.025em] ${trend.weeklyChange < 0 ? 'text-accent' : 'text-danger'}`}>
                  {trend.weeklyChange > 0 ? '+' : ''}{trend.weeklyChange.toFixed(2)}
                  <span className="text-[11px] font-normal text-muted"> kg/vko</span>
                </div>
                <div className="mt-0.5 text-[10px] text-[#444]">
                  tavoite −{targetWeeklyRate} kg/vko
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1 text-[13px] leading-relaxed text-[#444]">
            Kirjaa vähintään 2 päivän paino<br />aloittaaksesi trendin.
          </div>
        )}
      </Card>

      {/* ── Add weight form ──────────────────────────────────────────── */}
      <Card className="mt-2.5">
        <div className={cardLabel}>Kirjaa aamupaino</div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Päivä"
            type="date"
            value={form.date}
            max={toISO(new Date())}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Field
            label="Paino (kg)"
            type="text"
            inputMode="decimal"
            value={form.kg}
            onChange={(e) => {
              const v = e.target.value
              if (isValidDecimalInput(v) || v === '') setForm({ ...form, kg: v })
            }}
            placeholder="74,5"
          />
        </div>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={!form.kg}
          className="mt-1 w-full"
        >
          Tallenna
        </Button>
      </Card>

      {/* ── TDEE evaluation ──────────────────────────────────────────── */}
      {tdeeEval && (
        <Card
          className={`mt-2.5 ${
            tdeeEval.ready && tdeeEval.significantError
              ? 'border-accent/20 bg-accent/[0.04]'
              : ''
          }`}
        >
          <div className={cardLabel}>TDEE-arviointi</div>
          {!tdeeEval.ready ? (
            <div className="text-[12px] leading-relaxed text-muted">{tdeeEval.message}</div>
          ) : tdeeEval.significantError ? (
            <>
              <div className="mb-2.5 text-[13px] leading-relaxed text-accent">
                Trendi ei vastaa TDEE-arvioita. Suositus:{' '}
                {tdeeEval.direction === 'lower' ? 'laske' : 'nosta'} TDEE:tä noin{' '}
                <strong>{Math.abs(Math.round(tdeeEval.tdeeError))} kcal</strong> kaikissa päivätyypeissä.
              </div>
              <div className="text-[11px] leading-relaxed text-muted">
                Implikoitu vaje (paino): {Math.round(tdeeEval.trendImpliedDailyDeficit)} kcal/pv<br />
                Oletettu vaje (TDEE): {Math.round(tdeeEval.assumedDailyDeficit)} kcal/pv<br />
                Ero: {tdeeEval.tdeeError > 0 ? '+' : ''}{Math.round(tdeeEval.tdeeError)} kcal/pv
              </div>
            </>
          ) : (
            <div className="text-[13px] text-accent">
              ✓ TDEE-arvio matchää painotrendin kanssa (ero alle 100 kcal/pv).
            </div>
          )}
        </Card>
      )}

      {/* ── Projection ───────────────────────────────────────────────── */}
      {projectedDate && projectedDate !== 'saavutettu' && (
        <Card className="mt-2.5">
          <div className={cardLabel}>Ennuste tavoitteeseen ({settings.targetWeight} kg)</div>
          <div className="text-[16px] font-semibold text-text">{formatDateShort(projectedDate)}</div>
          <div className="mt-1 text-[11px] text-muted">
            Cut-jakson loppu: {formatDateShort(settings.endDate)}
            {projectedDate <= settings.endDate
              ? <span className="ml-2 text-accent">✓ ehditään</span>
              : <span className="ml-2 text-danger">× ei ehditä nykyisellä tempolla</span>
            }
          </div>
        </Card>
      )}

      {/* ── Chart ────────────────────────────────────────────────────── */}
      {trend.trendData.length >= 3 && (
        <Card className="mt-2.5">
          <div className={cardLabel}>Trendi</div>
          <WeightChart trendData={trend.trendData} settings={settings} />
        </Card>
      )}

      {/* ── Progress bar to target ───────────────────────────────────── */}
      {trend.currentTrend && (
        <Card className="mt-2.5">
          <div className={cardLabel}>Matka tavoitteeseen</div>
          <div className="flex justify-between text-[12px] text-muted">
            <span>{settings.startWeight} kg</span>
            <span>{settings.targetWeight} kg</span>
          </div>
          <ProgressBar
            value={(settings.startWeight - trend.currentTrend) / (settings.startWeight - settings.targetWeight)}
            color="#d4b85a"
            height={6}
          />
        </Card>
      )}

      {/* ── Weight log ───────────────────────────────────────────────── */}
      {weights.length > 0 && (
        <div className="mt-[18px]">
          <div className="mb-1 flex items-baseline justify-between">
            <div className={sectionLabel}>Kirjaukset ({weights.length})</div>
            <div className="font-mono text-[9px] tracking-[0.06em] text-white/30">
              <span className="text-accent">■</span> nyk. keskiarvossa
            </div>
          </div>
          <div className="list-stagger">
            {displayedWeights.map((w) => {
              const inAvg = activeAvgIds.has(w.id)
              return (
                <div
                  key={w.id}
                  className={`flex items-center justify-between border-b border-white/[0.05] py-[11px] transition-opacity duration-200 ${w.excludeFromTrend ? 'opacity-45' : 'opacity-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex-shrink-0 rounded-sm ${inAvg ? 'w-1 h-7' : 'w-[3px] h-7'}`}
                      style={{
                        backgroundColor: w.excludeFromTrend
                          ? 'rgba(232,122,106,0.35)'
                          : inAvg
                            ? 'var(--color-accent)'
                            : 'rgba(255,255,255,0.10)',
                        boxShadow: inAvg ? '0 0 6px rgba(212,184,90,0.45)' : 'none',
                      }}
                    />
                    <div>
                      <div className={`text-[15px] font-[650] tabular-nums tracking-[-0.01em] ${inAvg ? 'text-text' : 'text-text'}`}>
                        {w.kg.toFixed(1)}
                        <span className="ml-1 text-[11px] font-normal text-[#555]">kg</span>
                        {w.excludeFromTrend ? (
                          <span className="ml-2 text-[9px] uppercase tracking-[0.06em] text-danger">
                            ohitettu
                          </span>
                        ) : inAvg ? (
                          <span className="ml-2 text-[9px] uppercase tracking-[0.06em] text-accent">
                            keskiarvossa
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-px text-[10px] text-[#444]">{formatDateShort(w.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleExclude(w.id)}
                      className={`rounded-[7px] border px-2.5 py-1.5 text-[10px] tracking-[0.04em] ${
                        w.excludeFromTrend
                          ? 'border-accent/30 text-accent'
                          : 'border-white/[0.06] text-[#444]'
                      }`}
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      {w.excludeFromTrend ? '+ trendi' : '− trendi'}
                    </button>
                    <button
                      className="icon-btn flex items-center justify-center rounded-md p-1.5 text-[#333]"
                      onClick={() => onDeleteWeight(w.id)}
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {sortedWeights.length > 10 && (
            <Button
              variant="ghost"
              onClick={() => setShowAll(!showAll)}
              className="mt-2.5 w-full text-[11px]"
            >
              {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${sortedWeights.length})`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
