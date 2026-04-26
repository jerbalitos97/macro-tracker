import { useState } from 'react'
import { Plus, Flame, X } from 'lucide-react'
import type { ComputedDay, ComputedResult, Meal, TrainingBurn } from '../types'
import { formatDayOfWeek } from '../lib/dates'
import { parsePositiveInt, parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { MealRow } from '../components/MealRow'
import { ProgressBar } from '../components/ProgressBar'
import { s } from '../styles/tokens'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest:       'Lepopäivä',
  single:     '1 treeni',
  double:     '2 treeniä',
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
      <div style={{ padding: 32, color: '#555', textAlign: 'center', marginTop: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Tämä päivä ei ole cut-ajanjakson sisällä.
          <br />Tarkista asetukset.
        </div>
      </div>
    )
  }

  const remaining = day.budget - day.netConsumed
  const proteinRemaining = Math.max(0, proteinTarget - day.protein)
  const pctConsumed = day.budget > 0 ? day.netConsumed / day.budget : 0
  const totalBurnKcal = burns.reduce((s, b) => s + b.kcal, 0)

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

  // Budget card colour coding
  const isOver = remaining < 0
  const budgetBorder = isOver
    ? '1px solid rgba(232,122,106,0.20)'
    : '1px solid rgba(255,255,255,0.07)'
  const budgetBg = isOver
    ? 'linear-gradient(145deg, #151210 0%, #131313 100%)'
    : 'linear-gradient(145deg, #141414 0%, #131313 100%)'

  const deficitPct = computed.totalDeficitTarget > 0
    ? computed.cumulativeDeficit / computed.totalDeficitTarget
    : 0

  return (
    <div style={s.content}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        ...s.dateHeader,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={s.dateMain}>{dayNameCap}</div>
          <div style={s.dateSub}>{DAY_TYPE_LABEL[day.dayType]}</div>
        </div>
        {savedFlash && (
          <div
            className="save-flash"
            style={{
              fontSize: 20,
              color: '#d4b85a',
              lineHeight: 1,
              marginTop: 2,
            }}
          >
            ✓
          </div>
        )}
      </div>

      {/* ── Budget card ─────────────────────────────────────────────── */}
      <div style={{ ...s.card, background: budgetBg, border: budgetBorder }}>
        <div style={s.cardLabel}>Budjetti tänään</div>

        {/* Big remaining number */}
        <div style={{ marginBottom: 2 }}>
          <span style={{
            fontSize: 46,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
            color: isOver ? '#e87a6a' : '#d4b85a',
            lineHeight: 1,
          }}>
            {remaining >= 0 ? '+' : ''}{Math.round(remaining).toLocaleString('fi-FI')}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>kcal jäljellä</div>

        <ProgressBar value={pctConsumed} color={isOver ? '#e87a6a' : '#d4b85a'} height={7} />

        <div style={s.statsRow}>
          <div>
            <span style={s.statNum}>
              {totalBurnKcal > 0
                ? day.netConsumed.toLocaleString('fi-FI')
                : day.consumed.toLocaleString('fi-FI')}
            </span>
            <span style={s.statLabel}> / {day.budget.toLocaleString('fi-FI')} kcal</span>
          </div>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.04em' }}>
            TDEE {day.baseTdee.toLocaleString('fi-FI')}
          </div>
        </div>

        {/* Training burn breakdown */}
        {totalBurnKcal > 0 && (
          <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { label: 'Syöty',          val: `${day.consumed.toLocaleString('fi-FI')} kcal`,    color: '#777' },
              { label: 'Treenikulutus',  val: `−${totalBurnKcal.toLocaleString('fi-FI')} kcal`, color: '#6a9ad4' },
              { label: 'Netto',          val: `${day.netConsumed.toLocaleString('fi-FI')} kcal`, color: '#ebebeb' },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color,
                  marginTop: 4,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: label === 'Netto' ? 600 : 400,
                }}
              >
                <span>{label}</span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        )}

        {day.note && <div style={s.noteBadge}>{day.note}</div>}
      </div>

      {/* ── Protein card ────────────────────────────────────────────── */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Proteiini</div>
        <div style={s.proteinRow}>
          <div>
            <span style={s.proteinBig}>{Math.round(day.protein)}</span>
            <span style={s.proteinUnit}> / {proteinTarget} g</span>
          </div>
          <div style={{ fontSize: 11, color: proteinRemaining <= 0 ? '#6ab46a' : '#555' }}>
            {proteinRemaining > 0
              ? `vielä ${Math.round(proteinRemaining)} g`
              : '✓ tavoite täynnä'}
          </div>
        </div>
        <ProgressBar value={day.protein / proteinTarget} color="#6a9ad4" height={6} />
      </div>

      {/* ── Meals list ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <div style={s.sectionLabel}>Ateriat ({meals.length})</div>
        {meals.length === 0 ? (
          <div style={{ fontSize: 12, color: '#3a3a3a', padding: '10px 0' }}>
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
        <div style={{ marginTop: 14 }}>
          <div style={s.sectionLabel}>Treenikulutus ({burns.length})</div>
          <div className="list-stagger">
            {burns.map((b) => (
              <div key={b.id} style={s.mealRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: 'rgba(106,154,212,0.4)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 650, color: '#6a9ad4', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      −{b.kcal.toLocaleString('fi-FI')}
                      <span style={{ fontSize: 11, color: '#4a6a94', fontWeight: 400, marginLeft: 4 }}>kcal</span>
                    </div>
                    {b.note && (
                      <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>{b.note}</div>
                    )}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => onDeleteBurn(b.id)}
                  style={{ ...s.iconBtn, color: '#333' }}
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
        <div className="card-enter" style={{ ...s.card, marginTop: 12, border: '1px solid rgba(212,184,90,0.15)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                placeholder="500"
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
                placeholder="30"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => handleAddMeal(false)} style={s.primaryBtn}>
              Lisää
            </button>
            <button onClick={() => handleAddMeal(true)} style={s.secondaryBtn}>
              + Uusi
            </button>
            <button onClick={() => setShowMealForm(false)} style={s.ghostBtn}>Peru</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowMealForm(true); setShowBurnForm(false) }}
          style={s.addBtn}
        >
          <Plus size={14} />Lisää ateria
        </button>
      )}

      {/* ── Add training burn form ───────────────────────────────────── */}
      {showBurnForm ? (
        <div className="card-enter" style={{ ...s.card, marginTop: 8, border: '1px solid rgba(106,154,212,0.15)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                placeholder="350"
              />
            </div>
            <div>
              <label style={s.inputLabel}>Huomio (vapaaehtoinen)</label>
              <input
                type="text"
                value={burnForm.note}
                onChange={(e) => setBurnForm({ ...burnForm, note: e.target.value })}
                style={s.input}
                placeholder="juoksu, sali…"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={handleAddBurn}
              style={{ ...s.primaryBtn, backgroundColor: 'rgba(106,154,212,0.15)', color: '#6a9ad4', border: '1px solid rgba(106,154,212,0.3)' }}
            >
              Lisää
            </button>
            <button onClick={() => setShowBurnForm(false)} style={s.ghostBtn}>Peru</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowBurnForm(true); setShowMealForm(false) }}
          style={{ ...s.addBtn, borderColor: 'rgba(106,154,212,0.2)', color: '#5a8ac4', marginTop: 8 }}
        >
          <Flame size={13} />Lisää treenikulutus
        </button>
      )}

      {/* ── Cumulative deficit ───────────────────────────────────────── */}
      <div style={{
        ...s.card,
        marginTop: 22,
        background: 'linear-gradient(145deg, #0f0f0f 0%, #111 100%)',
        border: '1px solid rgba(212,184,90,0.08)',
      }}>
        <div style={s.cardLabel}>Kumulatiivinen vaje</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#ebebeb',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.025em',
            }}>
              {Math.round(computed.cumulativeDeficit).toLocaleString('fi-FI')}
              <span style={{ fontSize: 13, color: '#555', fontWeight: 400, letterSpacing: '0', marginLeft: 4 }}>kcal</span>
            </div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
              / {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal tavoite
            </div>
          </div>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#d4b85a',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.025em',
          }}>
            {(deficitPct * 100).toFixed(1)}
            <span style={{ fontSize: 12, color: '#666', fontWeight: 400, letterSpacing: '0' }}>%</span>
          </div>
        </div>
        <ProgressBar value={deficitPct} color="#d4b85a" height={4} />
      </div>
    </div>
  )
}
