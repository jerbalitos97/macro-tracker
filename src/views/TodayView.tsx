import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { ComputedDay, ComputedResult, Meal } from '../types'
import { formatDayOfWeek } from '../lib/dates'
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
  proteinTarget: number
  computed: ComputedResult
  onAddMeal: (meal: { kcal: number; protein: number }) => void
  onDeleteMeal: (id: number) => void
}

export function TodayView({ day, meals, proteinTarget, computed, onAddMeal, onDeleteMeal }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ kcal: '', protein: '' })

  if (!day) {
    return (
      <div style={{ padding: 20, color: '#888', textAlign: 'center', marginTop: 40 }}>
        Tämä päivä ei ole cut-ajanjakson sisällä. Tarkista asetukset.
      </div>
    )
  }

  const remaining = day.budget - day.consumed
  const proteinRemaining = Math.max(0, proteinTarget - day.protein)
  const pctConsumed = day.budget > 0 ? day.consumed / day.budget : 0

  const handleAdd = () => {
    const kcal = parseInt(form.kcal)
    const protein = parseFloat(form.protein) || 0
    if (!kcal || kcal <= 0) return
    onAddMeal({ kcal, protein })
    setForm({ kcal: '', protein: '' })
  }

  const dayName = formatDayOfWeek(day.date)
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1)

  return (
    <div style={s.content}>
      {/* Header */}
      <div style={s.dateHeader}>
        <div style={s.dateMain}>{dayNameCap}</div>
        <div style={s.dateSub}>{DAY_TYPE_LABEL[day.dayType]}</div>
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
            <span style={s.statNum}>{day.consumed.toLocaleString('fi-FI')}</span>
            <span style={s.statLabel}> / {day.budget.toLocaleString('fi-FI')} kcal</span>
          </div>
          <div style={{ color: '#666', fontSize: 11 }}>
            TDEE {day.baseTdee.toLocaleString('fi-FI')}
          </div>
        </div>
        {day.note && <div style={s.noteBadge}>{day.note}</div>}
      </div>

      {/* Protein card */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Proteiini</div>
        <div style={s.proteinRow}>
          <div style={s.proteinBig}>
            {Math.round(day.protein)}
            <span style={s.proteinUnit}> / {proteinTarget} g</span>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {proteinRemaining > 0
              ? `vielä ${Math.round(proteinRemaining)} g`
              : '✓ tavoite täynnä'}
          </div>
        </div>
        <ProgressBar value={day.protein / proteinTarget} color="#6a9ad4" />
      </div>

      {/* Meals list */}
      <div style={{ marginTop: 16 }}>
        <div style={s.sectionLabel}>Ateriat ({meals.length})</div>
        {meals.length === 0 && (
          <div style={{ fontSize: 12, color: '#555', padding: '10px 0' }}>
            Ei vielä aterioita.
          </div>
        )}
        {meals.map((m) => (
          <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />
        ))}
      </div>

      {/* Add meal form */}
      {showForm ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={s.inputLabel}>kcal</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.kcal}
                onChange={(e) => setForm({ ...form, kcal: e.target.value })}
                style={s.input}
                autoFocus
                placeholder="0"
              />
            </div>
            <div>
              <label style={s.inputLabel}>proteiini (g)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
                style={s.input}
                placeholder="0"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => { handleAdd(); setShowForm(false) }}
              style={s.primaryBtn}
            >
              Lisää
            </button>
            <button
              onClick={() => { handleAdd(); setForm({ kcal: '', protein: '' }) }}
              style={s.secondaryBtn}
            >
              Lisää + uusi
            </button>
            <button onClick={() => setShowForm(false)} style={s.ghostBtn}>
              Peru
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={s.addBtn}>
          <Plus size={14} />
          Lisää ateria
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
        <ProgressBar
          value={computed.cumulativeDeficit / computed.totalDeficitTarget}
          color="#d4b85a"
          height={3}
        />
      </div>
    </div>
  )
}
