import { useState } from 'react'
import { Plus, Flame, X } from 'lucide-react'
import type { ComputedDay, ComputedResult, Meal, TrainingBurn } from '../types'
import { formatDayOfWeek } from '../lib/dates'
import { parsePositiveInt, parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { MealRow } from '../components/MealRow'
import { ProgressBar } from '../components/ProgressBar'
import { Card, Button, Field, RingGauge } from '../components/ui'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest:       'Lepopäivä',
  single:     '1 treeni',
  double:     '2 treeniä',
  volleyball: 'Volleyball',
}

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const sectionLabel = 'mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

interface Props {
  day: ComputedDay | undefined
  meals: Meal[]
  burns: TrainingBurn[]
  proteinTarget: number
  computed: ComputedResult
  onAddMeal: (meal: { kcal: number; protein: number }) => void
  onDeleteMeal: (id: number) => void
  onAddBurn: (burn: { kcal: number; note: string }) => void
  onDeleteBurn: (id: number) => void
  onSetAdjustment: (date: string, kcal: number, note: string) => void
}

export function TodayView({
  day,
  meals,
  burns,
  proteinTarget,
  computed,
  onAddMeal,
  onDeleteMeal,
  onAddBurn,
  onDeleteBurn,
  onSetAdjustment,
}: Props) {
  const [showMealForm, setShowMealForm] = useState(false)
  const [showBurnForm, setShowBurnForm] = useState(false)
  const [mealForm, setMealForm] = useState({ kcal: '', protein: '' })
  const [burnForm, setBurnForm] = useState({ kcal: '', note: '' })
  const [savedFlash, setSavedFlash] = useState(false)

  if (!day) {
    return (
      <div className="mt-10 p-8 text-center text-muted">
        <div className="mb-3 text-[32px]">📅</div>
        <div className="text-[13px] leading-relaxed">
          Tämä päivä ei ole cut-ajanjakson sisällä.
          <br />Tarkista asetukset.
        </div>
      </div>
    )
  }

  const totalBurnKcal = burns.reduce((s, b) => s + b.kcal, 0)
  // Burns add to the day's budget (more food earned by training) instead of
  // subtracting from food eaten — same math, more intuitive presentation.
  const effectiveBudget = day.budget + totalBurnKcal
  const remaining = effectiveBudget - day.consumed
  const proteinRemaining = Math.max(0, proteinTarget - day.protein)
  const pctConsumed = effectiveBudget > 0 ? day.consumed / effectiveBudget : 0

  const flashSaved = () => {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1000)
  }

  const handleAddMeal = (keepOpen: boolean) => {
    const kcal = parsePositiveInt(mealForm.kcal)
    const protein = parsePositiveDecimal(mealForm.protein)
    if (!kcal || kcal <= 0) return
    onAddMeal({ kcal, protein })
    flashSaved()
    if (keepOpen) {
      setMealForm({ kcal: '', protein: '' })
    } else {
      setMealForm({ kcal: '', protein: '' })
      setShowMealForm(false)
    }
  }

  const handleAddBurn = () => {
    const kcal = parsePositiveInt(burnForm.kcal)
    if (!kcal || kcal <= 0) return
    onAddBurn({ kcal, note: burnForm.note })
    setBurnForm({ kcal: '', note: '' })
    setShowBurnForm(false)
    flashSaved()
  }

  const dayName = formatDayOfWeek(day.date)
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1)

  const isOver = remaining < 0

  const deficitPct = computed.totalDeficitTarget > 0
    ? computed.cumulativeDeficit / computed.totalDeficitTarget
    : 0

  return (
    <div className="px-4 pb-2 pt-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="font-display text-[24px] font-bold tracking-[-0.03em] text-text">{dayNameCap}</div>
          <div className="mt-[3px] text-[11px] uppercase tracking-[0.1em] text-muted">{DAY_TYPE_LABEL[day.dayType]}</div>
        </div>
        {savedFlash && (
          <div className="save-flash mt-0.5 text-[20px] leading-none text-accent">✓</div>
        )}
      </div>

      {/* ── Budget card ─────────────────────────────────────────────── */}
      <Card variant="glass" className="flex flex-col items-center">
        <div className={`${cardLabel} self-start`}>Budjetti tänään</div>

        {/* Oura-style gradient ring — fill = % of budget used, centre = kcal left */}
        <RingGauge
          fraction={isOver ? 1 : pctConsumed}
          gradientId="budgetRing"
          from={isOver ? '#e87a6a' : '#7fe3d4'}
          to={isOver ? '#e8946a' : '#5b8def'}
          glow={isOver ? 'rgba(232,122,106,0.5)' : 'rgba(127,227,212,0.5)'}
          size={168}
        >
          <span
            className={`font-display text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums ${isOver ? 'text-danger' : 'text-text'}`}
          >
            {remaining >= 0 ? '+' : ''}{Math.round(remaining).toLocaleString('fi-FI')}
          </span>
          <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">kcal jäljellä</span>
        </RingGauge>

        {/* Side stats */}
        <div className="mt-5 flex items-start gap-7">
          <div className="text-center">
            <div className="text-[20px] font-bold tabular-nums tracking-[-0.02em] text-text">{day.consumed.toLocaleString('fi-FI')}</div>
            <div className="mt-0.5 text-[11px] text-white/50">syöty</div>
          </div>
          <div className="text-center">
            <div className="text-[20px] font-bold tabular-nums tracking-[-0.02em] text-text">{effectiveBudget.toLocaleString('fi-FI')}</div>
            <div className="mt-0.5 text-[11px] text-white/50">budjetti</div>
          </div>
          <div className="text-center">
            <div className="text-[20px] font-bold tabular-nums tracking-[-0.02em] text-white/70">{day.baseTdee.toLocaleString('fi-FI')}</div>
            <div className="mt-0.5 text-[11px] text-white/50">TDEE</div>
          </div>
        </div>

        {/* Training burn breakdown */}
        {totalBurnKcal > 0 && (
          <div className="mt-4 w-full border-t border-white/[0.1] pt-3">
            {[
              { label: 'Perusbudjetti', val: `${day.budget.toLocaleString('fi-FI')} kcal`,      cls: 'text-[#777]' },
              { label: 'Treenikulutus', val: `+${totalBurnKcal.toLocaleString('fi-FI')} kcal`,   cls: 'text-protein' },
              { label: 'Budjetti',      val: `${effectiveBudget.toLocaleString('fi-FI')} kcal`,  cls: 'text-text' },
            ].map(({ label, val, cls }) => (
              <div
                key={label}
                className={`mt-1 flex justify-between text-[11px] tabular-nums ${cls} ${label === 'Budjetti' ? 'font-semibold' : 'font-normal'}`}
              >
                <span>{label}</span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        )}

        {day.note && (
          <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-lg border border-accent/15 bg-accent/[0.08] px-2.5 py-[5px] text-[11px] text-accent">
            {day.note}
          </div>
        )}
      </Card>

      {/* ── Spread-the-excess suggestion ────────────────────────────── */}
      {isOver && Math.abs(remaining) >= 50 && (() => {
        const excess = Math.abs(remaining)
        const todayIdx = computed.days.findIndex((d) => d.date === day.date)
        // Only count future days within the cut window
        const futureDays = todayIdx >= 0 ? computed.days.slice(todayIdx + 1) : []
        if (futureDays.length === 0) return null
        const options = [3, 5, 7].filter((n) => n <= futureDays.length)
        if (options.length === 0) options.push(futureDays.length)

        const apply = (n: number) => {
          const perDay = Math.ceil(excess / n)
          if (!window.confirm(`Lisää ${perDay} kcal vajetta seuraaville ${n} päivälle?`)) return
          const noteTag = `tasoitus ${day.date.slice(5)}`
          for (let i = 0; i < n; i++) {
            const target = futureDays[i]
            const existingKcal = target.adjustment?.kcal ?? 0
            const newKcal = existingKcal - perDay
            const noteParts = [target.adjustment?.note, noteTag].filter(Boolean)
            onSetAdjustment(target.date, newKcal, noteParts.join(' · '))
          }
          flashSaved()
        }

        return (
          <div className="mt-2.5 rounded-card border border-danger/[0.22] bg-danger/[0.05] p-4">
            <div className={`${cardLabel} text-danger`}>Tasoitus</div>
            <p className="m-0 mb-3 text-[13px] leading-normal text-white/70">
              Ylitit budjetin <strong className="text-white">{excess.toLocaleString('fi-FI')} kcal</strong>.
              Jaa se tulevien päivien lisävajeeksi pysyäksesi linjalla.
            </p>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
              {options.map((n) => {
                const perDay = Math.ceil(excess / n)
                return (
                  <button
                    key={n}
                    onClick={() => apply(n)}
                    className="rounded-lg border border-white/[0.08] bg-black/30 px-1.5 py-2.5 text-center"
                  >
                    <div className="text-[13px] font-bold tabular-nums text-white">
                      −{perDay}
                      <span className="font-normal text-[#777]"> kcal/pv</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#777]">
                      {n} päivälle
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Protein card ────────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Proteiini</div>
        <div className="flex items-end justify-between">
          <div>
            <span className="font-display text-[28px] font-bold tabular-nums tracking-[-0.02em] text-protein">{Math.round(day.protein)}</span>
            <span className="text-xs text-muted"> / {proteinTarget} g</span>
          </div>
          <div className={`text-[11px] ${proteinRemaining <= 0 ? 'text-[#6ab46a]' : 'text-muted'}`}>
            {proteinRemaining > 0
              ? `vielä ${Math.round(proteinRemaining)} g`
              : '✓ tavoite täynnä'}
          </div>
        </div>
        <ProgressBar value={day.protein / proteinTarget} color="#6a9ad4" height={6} />
      </Card>

      {/* ── Meals list ──────────────────────────────────────────────── */}
      <div className="mt-[18px]">
        <div className={sectionLabel}>Ateriat ({meals.length})</div>
        {meals.length === 0 ? (
          <div className="py-2.5 text-xs text-[#3a3a3a]">
            Ei vielä aterioita.
          </div>
        ) : (
          <div className="list-stagger">
            {meals.map((m) => (
              <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />
            ))}
          </div>
        )}
      </div>

      {/* ── Training burns list ──────────────────────────────────────── */}
      {burns.length > 0 && (
        <div className="mt-3.5">
          <div className={sectionLabel}>Treenikulutus ({burns.length})</div>
          <div className="list-stagger">
            {burns.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b border-white/[0.05] py-[11px]">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-[3px] flex-shrink-0 rounded-sm bg-protein/40" />
                  <div>
                    <div className="text-[15px] font-[650] tabular-nums tracking-[-0.01em] text-protein">
                      −{b.kcal.toLocaleString('fi-FI')}
                      <span className="ml-1 text-[11px] font-normal text-[#4a6a94]">kcal</span>
                    </div>
                    {b.note && (
                      <div className="mt-px text-[11px] text-[#444]">{b.note}</div>
                    )}
                  </div>
                </div>
                <button
                  className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-[#333]"
                  onClick={() => onDeleteBurn(b.id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add meal form ────────────────────────────────────────────── */}
      {showMealForm ? (
        <Card className="card-enter mt-3 border-accent/15">
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="kcal"
              type="text"
              inputMode="numeric"
              value={mealForm.kcal}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d*$/.test(v)) setMealForm({ ...mealForm, kcal: v })
              }}
              autoFocus
              placeholder="500"
            />
            <Field
              label="proteiini (g)"
              type="text"
              inputMode="decimal"
              value={mealForm.protein}
              onChange={(e) => {
                const v = e.target.value
                if (isValidDecimalInput(v) || v === '') setMealForm({ ...mealForm, protein: v })
              }}
              placeholder="30"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => handleAddMeal(false)}>Lisää</Button>
            <Button variant="secondary" onClick={() => handleAddMeal(true)}>+ Uusi</Button>
            <Button variant="ghost" onClick={() => setShowMealForm(false)}>Peru</Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => { setShowMealForm(true); setShowBurnForm(false) }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/[0.12] bg-transparent px-4 py-[13px] text-[13px] tracking-[0.02em] text-[#666]"
        >
          <Plus size={14} />Lisää ateria
        </button>
      )}

      {/* ── Add training burn form ───────────────────────────────────── */}
      {showBurnForm ? (
        <Card className="card-enter mt-2 border-protein/15">
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Kulutettu (kcal)"
              type="text"
              inputMode="numeric"
              value={burnForm.kcal}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d*$/.test(v)) setBurnForm({ ...burnForm, kcal: v })
              }}
              autoFocus
              placeholder="350"
            />
            <Field
              label="Huomio (vapaaehtoinen)"
              type="text"
              value={burnForm.note}
              onChange={(e) => setBurnForm({ ...burnForm, note: e.target.value })}
              placeholder="juoksu, sali…"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleAddBurn}
              className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-[10px] border border-protein/30 bg-protein/15 px-4 py-3 text-[13px] font-bold text-protein"
            >
              Lisää
            </button>
            <Button variant="ghost" onClick={() => setShowBurnForm(false)}>Peru</Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => { setShowBurnForm(true); setShowMealForm(false) }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-protein/20 bg-transparent px-4 py-[13px] text-[13px] tracking-[0.02em] text-[#5a8ac4]"
        >
          <Flame size={13} />Lisää treenikulutus
        </button>
      )}

      {/* ── Cumulative deficit ───────────────────────────────────────── */}
      <Card variant="glass" className="mt-[22px]">
        <div className={cardLabel}>Kumulatiivinen vaje</div>
        <div className="flex items-end justify-between">
          <div>
            <div className="font-display text-[26px] font-extrabold tabular-nums tracking-[-0.025em] text-text">
              {Math.round(computed.cumulativeDeficit).toLocaleString('fi-FI')}
              <span className="ml-1 text-[13px] font-normal text-muted">kcal</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[#444]">
              / {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal tavoite
            </div>
          </div>
          <div className="text-[22px] font-extrabold tabular-nums tracking-[-0.025em] text-accent">
            {(deficitPct * 100).toFixed(1)}
            <span className="text-xs font-normal text-[#666]">%</span>
          </div>
        </div>
        <ProgressBar value={deficitPct} color="#d4b85a" height={4} />
      </Card>
    </div>
  )
}
