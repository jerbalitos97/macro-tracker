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
import { Card, Button, Field } from '../components/ui'

const DAY_TYPE_LABEL: Record<string, string> = {
  rest: 'Lepopäivä',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

const iconBtn = 'icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-[#444]'

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

  const addBtn = (label: string, onClick: () => void, mt: string) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/[0.12] bg-transparent px-4 py-[13px] text-[13px] tracking-[0.02em] text-[#666] ${mt}`}
    >
      <Plus size={14} />
      {label}
    </button>
  )

  return (
    <div className="px-4 pb-2 pt-4">
      <CalendarGrid
        days={computed.days}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />

      {selectedDay && (
        <Card variant="glass" className="mt-4">
          <div className="flex items-center justify-between">
            <button
              onClick={goPrev}
              className={iconBtn}
              disabled={selectedIdx === 0}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-center">
              <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text">
                {formatDateShort(selectedDay.date)}
              </div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-muted">
                {DAY_TYPE_LABEL[selectedDay.dayType]}
              </div>
            </div>
            <button
              onClick={goNext}
              className={iconBtn}
              disabled={selectedIdx === computed.days.length - 1}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mt-3.5 border-t border-white/[0.1] pt-3.5">
            <DayBreakdown day={selectedDay} />
          </div>
          {selectedDay.events.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {selectedDay.events.map((e) => (
                <div
                  key={e.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/[0.08] px-2.5 py-[5px] text-[11px] text-accent"
                >
                  🎉 {e.name}
                  <button
                    onClick={() => onDeleteEvent(e.id)}
                    className="icon-btn ml-2 inline-flex min-h-0 min-w-0 items-center justify-center text-accent"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Edit meals + burns for the selected day */}
      {selectedDay && (
        <Card variant="glass" className="mt-2.5">
          <div className={cardLabel}>Ateriat ({dayMeals.length})</div>
          {dayMeals.map((m) => (
            <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />
          ))}
          {!showMealForm ? (
            addBtn('Lisää ateria', () => setShowMealForm(true), dayMeals.length > 0 ? 'mt-3' : 'mt-2')
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="kcal"
                  type="number"
                  inputMode="numeric"
                  value={mealForm.kcal}
                  onChange={(e) => setMealForm({ ...mealForm, kcal: e.target.value })}
                  autoFocus
                />
                <Field
                  label="Proteiini g"
                  type="number"
                  inputMode="decimal"
                  value={mealForm.protein}
                  onChange={(e) => setMealForm({ ...mealForm, protein: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleAddMeal}>Tallenna</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowMealForm(false)
                    setMealForm({ kcal: '', protein: '' })
                  }}
                >
                  Peru
                </Button>
              </div>
            </div>
          )}

          <div className={`${cardLabel} mt-[18px]`}>Treenikulutus ({dayBurns.length})</div>
          {dayBurns.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b border-white/[0.05] py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Flame size={14} className="text-protein" />
                <div>
                  <div className="text-sm font-semibold tabular-nums text-text">
                    +{b.kcal.toLocaleString('fi-FI')}
                    <span className="ml-1 text-[11px] text-[#555]">kcal</span>
                  </div>
                  {b.note && (
                    <div className="mt-px text-[11px] text-[#666]">{b.note}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => onDeleteBurn(b.id)}
                aria-label="Poista treenikulutus"
                className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-[#3a3a3a]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {!showBurnForm ? (
            addBtn('Lisää treenikulutus', () => setShowBurnForm(true), dayBurns.length > 0 ? 'mt-3' : 'mt-2')
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              <Field
                label="kcal"
                type="number"
                inputMode="numeric"
                value={burnForm.kcal}
                onChange={(e) => setBurnForm({ ...burnForm, kcal: e.target.value })}
                autoFocus
              />
              <Field
                label="Muistiinpano (valinnainen)"
                type="text"
                value={burnForm.note}
                onChange={(e) => setBurnForm({ ...burnForm, note: e.target.value })}
                placeholder="esim. juoksu"
              />
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleAddBurn}>Tallenna</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowBurnForm(false)
                    setBurnForm({ kcal: '', note: '' })
                  }}
                >
                  Peru
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="action" onClick={() => setModalType('event')}>
          <PartyPopper size={14} />
          Juhla
        </Button>
        <Button variant="action" onClick={() => setModalType('extra')}>
          <Dumbbell size={14} />
          Treeni
        </Button>
        <Button variant="action" onClick={() => setModalType('adjustment')}>
          <Sliders size={14} />
          Säätö
        </Button>
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
