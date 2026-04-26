import { useState } from 'react'
import { Plus, Flame } from 'lucide-react'
import type { ComputedDay, ComputedResult, Meal, TrainingBurn } from '../types'
import { formatDayOfWeek } from '../lib/dates'
import { parsePositiveInt, parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { MealRow } from '../components/MealRow'
import { ProgressBar } from '../components/ProgressBar'
import { s } from '../styles/tokens'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest: 'Lepopäivä',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

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
}: Props) {
  const [showMealForm, setShowMealForm] = useState(false)
  const [showBurnForm, setShowBurnForm] = useState(false)
  const [mealForm, setMealForm] = useState({ kcal: '', protein: '' })
  const [burnForm, setBurnForm] = useState({ kcal: '', note: '' })
  const [savedFlash, setSavedFlash] = useState(false)

  if (!day) {
    return (
      <div style={{ padding: 20, color: '#888', textAlign: 'center', marginTop: 40 }}>
        Tämä päivä ei ole cut-ajanjakson sisällä. Tarkista asetukset.
      </div>
    )
  }

  // Use netConsumed (food - burns) for budget comparison
  const remaining = day.budget - day.netConsumed
  const proteinRemaining = Math.max(0, proteinTarget - day.protein)
  const pctConsumed = day.budget > 0 ? day.netConsumed / day.budget : 0

  const flashSaved = () => {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 900)
  }

  const handleAddMeal = () => {
    const kcal = parsePositiveInt(mealForm.kcal)
    const protein = parsePositiveDecimal(mealForm.protein)
    if (!kcal || kcal <= 0) return
    onAddMeal({ kcal, protein })
    setMealForm({ kcal: '', protein: '' })
    flashSaved()
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
  const totalBurnKcal = burns.reduce((s, b) => s + b.kcal, 0)

  return (
    <div style={s.content}>
      {/* Header */}
      <div style={{ ...s.dateHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={s.dateMain}>{dayNameCap}</div>
          <div style={s.dateSub}>{DAY_TYPE_LABEL[day.dayType]}</div>
        </div>
        {savedFlash && (
          <div className="save-flash" style={{ fontSize: 22, color: '#d4b85a', lineHeight: 1 }}>✓</div>
        )}
      </div>

      {/* Budget card */}
      <div style={s.card}>
        <div style={s.cardLabel}>Budjetti tänään</div>
        <div style={s.bigNumber}>
          <span style={{ color: remaining >= 0 ? '#d4b85a' : '#e87a6a' }}>
            {remaining >= 0 ? '+' : ''}{Math.round(remaining).toLocaleString('fi-FI')}
          </span>
          <span style={s.unit}>kcal jäljellä</span>
        </div>
        <ProgressBar value={pctConsumed} color={pctConsumed > 1 ? '#e87a6a' : '#d4b85a'} />
        <div style={s.statsRow}>
          <div>
            {/* Show net consumed if burns exist, otherwise just consumed */}
            {totalBurnKcal > 0 ? (
              <span style={s.statNum}>{day.netConsumed.toLocaleString('fi-FI')}</span>
            ) : (
              <span style={s.statNum}>{day.consumed.toLocaleString('fi-FI')}</span>
            )}
            <span style={s.statLabel}> / {day.budget.toLocaleString('fi-FI')} kcal</span>
          </div>
          <div style={{ color: '#666', fontSize: 11 }}>
            TDEE {day.baseTdee.toLocaleString('fi-FI')}
          </div>
        </div>

        {/* Training burn breakdown — shown only when burns exist */}
        {totalBurnKcal > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f1f1f', fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
              <span>Syöty</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{day.consumed.toLocaleString('fi-FI')} kcal</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6a9ad4', marginTop: 2 }}>
              <span>Treenikulutus</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{totalBurnKcal.toLocaleString('fi-FI')} kcal</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e5e5e5', marginTop: 2, fontWeight: 600 }}>
              <span>Netto</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{day.netConsumed.toLocaleString('fi-FI')} kcal</span>
            </div>
          </div>
        )}

        {day.note && <div style={s.noteBadge}>{day.note}</div>}
      </div>

      {/* Protein card */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Proteiini</div>
        <div style={s.proteinRow}>
          <div style={s.proteinBig}>
            {Math.round(day.protein)}<span style={s.proteinUnit}> / {proteinTarget} g</span>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {proteinRemaining > 0 ? `vielä ${Math.round(proteinRemaining)} g` : '✓ tavoite täynnä'}
          </div>
        </div>
        <ProgressBar value={day.protein / proteinTarget} color="#6a9ad4" />
      </div>

      {/* Meals list */}
      <div style={{ marginTop: 16 }}>
        <div style={s.sectionLabel}>Ateriat ({meals.length})</div>
        {meals.length === 0 && (
          <div style={{ fontSize: 12, color: '#555', padding: '10px 0' }}>Ei vielä aterioita.</div>
        )}
        {meals.map((m) => <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />)}
      </div>

      {/* Training burns list */}
      {burns.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={s.sectionLabel}>Treenikulutus ({burns.length})</div>
          {burns.map((b) => (
            <div key={b.id} style={s.mealRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flame size={12} color="#6a9ad4" />
                <div>
                  <span style={{ ...s.mealKcal, color: '#6a9ad4' }}>−{b.kcal} kcal</span>
                  {b.note && <span style={{ fontSize: 11, color: '#555' }}>{b.note}</span>}
                </div>
              </div>
              <button onClick={() => onDeleteBurn(b.id)} style={s.iconBtn}>
                <span style={{ fontSize: 13 }}>×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add meal form */}
      {showMealForm ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={s.inputLabel}>kcal</label>
              <input
                type="text"
                inputMode="numeric"
                value={mealForm.kcal}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^\d*$/.test(v)) setMealForm({ ...mealForm, kcal: v })
                }}
                style={s.input}
                autoFocus
                placeholder="0"
              />
            </div>
            <div>
              <label style={s.inputLabel}>proteiini (g)</label>
              <input
                type="text"
                inputMode="decimal"
                value={mealForm.protein}
                onChange={(e) => {
                  const v = e.target.value
                  if (isValidDecimalInput(v) || v === '') setMealForm({ ...mealForm, protein: v })
                }}
                style={s.input}
                placeholder="0"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => { handleAddMeal(); setShowMealForm(false) }} style={s.primaryBtn}>
              Lisää
            </button>
            <button onClick={() => { handleAddMeal(); setMealForm({ kcal: '', protein: '' }) }} style={s.secondaryBtn}>
              Lisää + uusi
            </button>
            <button onClick={() => setShowMealForm(false)} style={s.ghostBtn}>Peru</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowMealForm(true); setShowBurnForm(false) }} style={s.addBtn}>
          <Plus size={14} />Lisää ateria
        </button>
      )}

      {/* Add training burn form */}
      {showBurnForm ? (
        <div style={{ ...s.card, marginTop: 8, border: '1px solid #1a2a3a' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={s.inputLabel}>Kulutettu (kcal)</label>
              <input
                type="text"
                inputMode="numeric"
                value={burnForm.kcal}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^\d*$/.test(v)) setBurnForm({ ...burnForm, kcal: v })
                }}
                style={s.input}
                autoFocus
                placeholder="300"
              />
            </div>
            <div>
              <label style={s.inputLabel}>Huomio (valinnainen)</label>
              <input
                type="text"
                value={burnForm.note}
                onChange={(e) => setBurnForm({ ...burnForm, note: e.target.value })}
                style={s.input}
                placeholder="juoksu, kuntosali…"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleAddBurn} style={{ ...s.primaryBtn, backgroundColor: '#1a3a5a', color: '#6ab4e8' }}>
              Lisää
            </button>
            <button onClick={() => setShowBurnForm(false)} style={s.ghostBtn}>Peru</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowBurnForm(true); setShowMealForm(false) }} style={{
          ...s.addBtn,
          borderColor: '#1a2a3a',
          color: '#6a9ad4',
          marginTop: 8,
        }}>
          <Flame size={13} />Lisää treenikulutus
        </button>
      )}

      {/* Cumulative deficit */}
      <div style={{ ...s.card, marginTop: 20, backgroundColor: '#0d0d0d' }}>
        <div style={s.cardLabel}>Kumulatiivinen vaje</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e5e5e5', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(computed.cumulativeDeficit).toLocaleString('fi-FI')}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              / {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal tavoite
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: '#d4b85a', fontVariantNumeric: 'tabular-nums' }}>
              {((computed.cumulativeDeficit / computed.totalDeficitTarget) * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: '#666' }}>valmis</div>
          </div>
        </div>
        <ProgressBar value={computed.cumulativeDeficit / computed.totalDeficitTarget} color="#d4b85a" height={3} />
      </div>
    </div>
  )
}
