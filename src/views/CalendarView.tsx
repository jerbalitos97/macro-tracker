import { useState } from 'react'
import { ChevronLeft, ChevronRight, PartyPopper, Dumbbell, Sliders, Trash2, Plus, Flame, X } from 'lucide-react'
import type { ComputedResult, ComputedDay, SpecialEvent, ExtraWorkout, Meal, TrainingBurn } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { parsePositiveInt, parsePositiveDecimal } from '../lib/format'
import { CalendarGrid } from '../components/CalendarGrid'
import { DayBreakdown } from '../components/DayBreakdown'
import { MealRow } from '../components/MealRow'
import { UpcomingList } from '../components/UpcomingList'
import { EventModal } from '../components/EventModal'
import { ExtraModal } from '../components/ExtraModal'
import { AdjustmentModal } from '../components/AdjustmentModal'
import { s } from '../styles/tokens'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest: 'Lepopäivä',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

interface Props {
  computed: ComputedResult
  selectedDate: string
  setSelectedDate: (d: string) => void
  selectedDay: ComputedDay | undefined
  events: SpecialEvent[]
  extras: ExtraWorkout[]
  meals: Meal[]
  burns: TrainingBurn[]
  onAddEvent: (ev: Omit<SpecialEvent, 'id'>) => void
  onDeleteEvent: (id: number) => void
  onAddExtra: (ex: Omit<ExtraWorkout, 'id'>) => void
  onDeleteExtra: (id: number) => void
  onSetAdjustment: (date: string, kcal: number, note: string) => void
  onDeleteAdjustment: (id: number) => void
  onAddMealOnDate: (meal: { kcal: number; protein: number }, date: string) => void
  onDeleteMeal: (id: number) => void
  onAddBurnOnDate: (burn: { kcal: number; note: string }, date: string) => void
  onDeleteBurn: (id: number) => void
}

export function CalendarView({
  computed,
  selectedDate,
  setSelectedDate,
  selectedDay,
  events,
  extras,
  meals,
  burns,
  onAddEvent,
  onDeleteEvent,
  onAddExtra,
  onDeleteExtra,
  onSetAdjustment,
  onDeleteAdjustment,
  onAddMealOnDate,
  onDeleteMeal,
  onAddBurnOnDate,
  onDeleteBurn,
}: Props) {
  const [modalType, setModalType] = useState<'event' | 'extra' | 'adjustment' | null>(null)
  const [showMealForm, setShowMealForm] = useState(false)
  const [showBurnForm, setShowBurnForm] = useState(false)
  const [mealForm, setMealForm] = useState({ kcal: '', protein: '' })
  const [burnForm, setBurnForm] = useState({ kcal: '', note: '' })
  const todayISO = toISO(new Date())

  const dayMeals = selectedDate ? meals.filter((m) => m.date === selectedDate) : []
  const dayBurns = selectedDate ? burns.filter((b) => b.date === selectedDate) : []

  const handleAddMeal = () => {
    const kcal = parsePositiveInt(mealForm.kcal)
    const protein = parsePositiveDecimal(mealForm.protein)
    if (!kcal || kcal <= 0) return
    onAddMealOnDate({ kcal, protein }, selectedDate)
    setMealForm({ kcal: '', protein: '' })
    setShowMealForm(false)
  }

  const handleAddBurn = () => {
    const kcal = parsePositiveInt(burnForm.kcal)
    if (!kcal || kcal <= 0) return
    onAddBurnOnDate({ kcal, note: burnForm.note }, selectedDate)
    setBurnForm({ kcal: '', note: '' })
    setShowBurnForm(false)
  }

  const selectedIdx = computed.days.findIndex((d) => d.date === selectedDate)
  const goPrev = () => {
    if (selectedIdx > 0) setSelectedDate(computed.days[selectedIdx - 1].date)
  }
  const goNext = () => {
    if (selectedIdx < computed.days.length - 1)
      setSelectedDate(computed.days[selectedIdx + 1].date)
  }

  return (
    <div style={s.content}>
      <CalendarGrid
        days={computed.days}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />

      {selectedDay && (
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={goPrev}
              style={s.iconBtn}
              disabled={selectedIdx === 0}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#888' }}>
                {formatDateShort(selectedDay.date)}
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>
                {DAY_TYPE_LABEL[selectedDay.dayType]}
              </div>
            </div>
            <button
              onClick={goNext}
              style={s.iconBtn}
              disabled={selectedIdx === computed.days.length - 1}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1f1f1f' }}>
            <DayBreakdown day={selectedDay} />
          </div>
          {selectedDay.events.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {selectedDay.events.map((e) => (
                <div key={e.id} style={s.noteBadge}>
                  🎉 {e.name}
                  <button
                    onClick={() => onDeleteEvent(e.id)}
                    style={{ ...s.iconBtn, marginLeft: 8, display: 'inline-flex' }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit meals + burns for the selected day */}
      {selectedDay && (
        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>Ateriat ({dayMeals.length})</div>
          {dayMeals.map((m) => (
            <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />
          ))}
          {!showMealForm ? (
            <button
              onClick={() => setShowMealForm(true)}
              style={{ ...s.addBtn, marginTop: dayMeals.length > 0 ? 12 : 8 }}
            >
              <Plus size={14} />
              Lisää ateria
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={s.inputLabel}>kcal</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={mealForm.kcal}
                    onChange={(e) => setMealForm({ ...mealForm, kcal: e.target.value })}
                    style={s.input}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={s.inputLabel}>Proteiini g</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={mealForm.protein}
                    onChange={(e) => setMealForm({ ...mealForm, protein: e.target.value })}
                    style={s.input}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddMeal} style={s.primaryBtn}>Tallenna</button>
                <button
                  onClick={() => {
                    setShowMealForm(false)
                    setMealForm({ kcal: '', protein: '' })
                  }}
                  style={s.ghostBtn}
                >
                  Peru
                </button>
              </div>
            </div>
          )}

          <div style={{ ...s.cardLabel, marginTop: 18 }}>Treenikulutus ({dayBurns.length})</div>
          {dayBurns.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Flame size={14} color="#6a9ad4" />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ebebeb', fontVariantNumeric: 'tabular-nums' }}>
                    +{b.kcal.toLocaleString('fi-FI')}
                    <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>kcal</span>
                  </div>
                  {b.note && (
                    <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{b.note}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => onDeleteBurn(b.id)}
                aria-label="Poista treenikulutus"
                style={{ ...s.iconBtn, color: '#3a3a3a' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {!showBurnForm ? (
            <button
              onClick={() => setShowBurnForm(true)}
              style={{ ...s.addBtn, marginTop: dayBurns.length > 0 ? 12 : 8 }}
            >
              <Plus size={14} />
              Lisää treenikulutus
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={s.inputLabel}>kcal</label>
              <input
                type="number"
                inputMode="numeric"
                value={burnForm.kcal}
                onChange={(e) => setBurnForm({ ...burnForm, kcal: e.target.value })}
                style={s.input}
                autoFocus
              />
              <label style={s.inputLabel}>Muistiinpano (valinnainen)</label>
              <input
                type="text"
                value={burnForm.note}
                onChange={(e) => setBurnForm({ ...burnForm, note: e.target.value })}
                style={s.input}
                placeholder="esim. juoksu"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddBurn} style={s.primaryBtn}>Tallenna</button>
                <button
                  onClick={() => {
                    setShowBurnForm(false)
                    setBurnForm({ kcal: '', note: '' })
                  }}
                  style={s.ghostBtn}
                >
                  Peru
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <button onClick={() => setModalType('event')} style={s.actionBtn}>
          <PartyPopper size={14} />
          Juhla
        </button>
        <button onClick={() => setModalType('extra')} style={s.actionBtn}>
          <Dumbbell size={14} />
          Treeni
        </button>
        <button onClick={() => setModalType('adjustment')} style={s.actionBtn}>
          <Sliders size={14} />
          Säätö
        </button>
      </div>

      <UpcomingList
        events={events}
        extras={extras}
        todayISO={todayISO}
        onDeleteEvent={onDeleteEvent}
        onDeleteExtra={onDeleteExtra}
      />

      {modalType === 'event' && (
        <EventModal
          defaultDate={selectedDate}
          onSave={(ev) => { onAddEvent(ev); setModalType(null) }}
          onClose={() => setModalType(null)}
        />
      )}
      {modalType === 'extra' && (
        <ExtraModal
          defaultDate={selectedDate}
          onSave={(ex) => { onAddExtra(ex); setModalType(null) }}
          onClose={() => setModalType(null)}
        />
      )}
      {modalType === 'adjustment' && (
        <AdjustmentModal
          date={selectedDate}
          current={
            selectedDay?.adjustment
              ? { kcal: selectedDay.adjustment.kcal, note: selectedDay.adjustment.note }
              : null
          }
          onSave={(kcal, note) => {
            onSetAdjustment(selectedDate, kcal, note)
            setModalType(null)
          }}
          onDelete={
            selectedDay?.adjustment
              ? () => {
                  onDeleteAdjustment(selectedDay.adjustment!.id)
                  setModalType(null)
                }
              : undefined
          }
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  )
}
