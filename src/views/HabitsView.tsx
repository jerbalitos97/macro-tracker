import { useMemo, useState } from 'react'
import { Plus, Check, Minus, Plus as PlusIcon, BarChart2, ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, getWeekdayNum, toISO } from '../lib/dates'
import { HabitFormModal } from '../components/HabitFormModal'
import { HabitDetailModal } from '../components/HabitDetailModal'
import { HabitsHistoryView } from './HabitsHistoryView'
import { Card } from '../components/ui'

interface Props {
  habits: Habit[]
  entries: HabitEntry[]
  onCreate: (input: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'isArchived' | 'habitType' | 'taskDays'>) => void
  onUpdate: (id: number, patch: Partial<Habit>) => void
  onArchive: (id: number) => void
  onIncrement: (habit: Habit, delta: number, date: string) => void
  onSetBinary: (habit: Habit, done: boolean, date: string) => void
}

const DAY_LETTERS = ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU']

const dateMain = 'font-display text-[22px] font-bold tracking-[-0.025em] text-text'
const dateSub = 'mt-[3px] text-[11px] uppercase tracking-[0.1em] text-muted'

// Returns the ISO date of Monday at the start of the week containing `iso`.
function weekStart(iso: string): string {
  const d = fromISO(iso)
  const dow = d.getDay() // 0 = Sun … 6 = Sat
  const offset = dow === 0 ? -6 : 1 - dow
  return addDays(iso, offset)
}

export function HabitsView({
  habits,
  entries,
  onCreate,
  onUpdate,
  onArchive,
  onIncrement,
  onSetBinary,
}: Props) {
  const todayISO = toISO(new Date())

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayISO)

  const detail = detailId !== null ? habits.find((h) => h.id === detailId) ?? null : null

  // Habits scheduled for the selected date (per task_days)
  const selectedDow = getWeekdayNum(selectedDate)
  const scheduledHabits = useMemo(
    () => habits.filter((h) => h.taskDays.includes(selectedDow)),
    [habits, selectedDow],
  )

  // Habit's value as of a given date — for week habits, cumulative through that
  // date within the week containing it.
  const valueFor = (habit: Habit, date: string): number => {
    if (habit.goalPeriod === 'week') {
      const wStart = weekStart(date)
      return entries
        .filter((e) => e.habitId === habit.id && e.date >= wStart && e.date <= date)
        .reduce((sum, e) => sum + e.value, 0)
    }
    const e = entries.find((x) => x.habitId === habit.id && x.date === date)
    return e?.value ?? 0
  }

  // Per-day completion summary used to colour the week-strip cells.
  const completionFor = (date: string) => {
    const dow = getWeekdayNum(date)
    const scheduled = habits.filter((h) => h.taskDays.includes(dow))
    if (scheduled.length === 0) return { hits: 0, total: 0, ratio: 0, perfect: false }
    let hits = 0
    for (const h of scheduled) {
      const v = valueFor(h, date)
      if (h.goalValue > 0 && v >= h.goalValue) hits++
    }
    return { hits, total: scheduled.length, ratio: hits / scheduled.length, perfect: hits === scheduled.length }
  }

  // Week strip: Mon → Sun of the week containing selectedDate.
  const stripWeekStart = weekStart(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(stripWeekStart, i))

  // Friendly label for the selected date
  const dateLabel = useMemo(() => {
    if (selectedDate === todayISO) return 'Tänään'
    if (selectedDate === addDays(todayISO, -1)) return 'Eilen'
    if (selectedDate === addDays(todayISO, 1)) return 'Huomenna'
    return fromISO(selectedDate).toLocaleDateString('fi-FI', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [selectedDate, todayISO])

  const canGoNextWeek = stripWeekStart < weekStart(todayISO)
  const goPrevWeek = () => setSelectedDate(addDays(selectedDate, -7))
  const goNextWeek = () => {
    if (!canGoNextWeek) return
    const next = addDays(selectedDate, 7)
    setSelectedDate(next > todayISO ? todayISO : next)
  }

  if (showHistory) {
    return (
      <HabitsHistoryView
        habits={habits}
        entries={entries}
        onClose={() => setShowHistory(false)}
      />
    )
  }

  return (
    <div className="px-4 pb-2 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className={dateMain}>Tavat</div>
          <div className={dateSub}>{dateLabel}</div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="Lisää tapa"
          className="active:scale-95 flex h-[52px] w-[52px] min-h-0 min-w-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-violet p-0 text-bg shadow-[0_0_24px_rgba(34,211,238,0.55)] transition-transform duration-150"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>

      {/* Week strip — tap a day to backfill entries on that date */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <button
            onClick={goPrevWeek}
            aria-label="Edellinen viikko"
            className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-white/55"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
            {fromISO(stripWeekStart).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
            {' – '}
            {fromISO(addDays(stripWeekStart, 6)).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
          </div>
          <button
            onClick={goNextWeek}
            aria-label="Seuraava viikko"
            disabled={!canGoNextWeek}
            className={`icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-white/55 ${canGoNextWeek ? '' : 'opacity-25'}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const c = completionFor(d)
            const isSelected = d === selectedDate
            const isToday = d === todayISO
            const isFuture = d > todayISO
            const dayNum = fromISO(d).getDate()
            const fillOpacity = c.total === 0 ? 0 : c.ratio === 0 ? 0 : Math.max(0.15, c.ratio * 0.6)
            const fillBg = !isSelected && c.ratio > 0
              ? `rgba(167, 139, 250, ${fillOpacity})`
              : 'transparent'
            return (
              <button
                key={d}
                onClick={() => !isFuture && setSelectedDate(d)}
                disabled={isFuture}
                className={`flex min-h-0 min-w-0 flex-col items-center gap-1 px-0.5 py-1.5 ${isFuture ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}`}
                aria-label={d}
              >
                <div
                  className={`font-mono text-[9px] tracking-[0.08em] ${isSelected ? 'text-accent' : 'text-white/40'}`}
                >
                  {DAY_LETTERS[i]}
                </div>
                <div
                  className="relative flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    border: isSelected
                      ? 'none'
                      : isToday
                        ? '1px solid rgba(34,211,238,0.45)'
                        : '1px solid rgba(255,255,255,0.08)',
                    background: isSelected
                      ? 'linear-gradient(135deg, #22d3ee, #a78bfa)'
                      : fillBg,
                    boxShadow: isSelected ? '0 0 16px rgba(34,211,238,0.55)' : 'none',
                  }}
                >
                  {c.perfect && (
                    <Crown
                      size={9}
                      color="#7dd3fc"
                      fill="#7dd3fc"
                      className="absolute -top-[3px] -right-0.5"
                    />
                  )}
                  <span
                    className={`text-xs leading-none tabular-nums ${isSelected || isToday ? 'font-bold' : 'font-medium'} ${isSelected ? 'text-bg' : isToday ? 'text-accent' : 'text-[#ebebeb]'}`}
                  >
                    {dayNum}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Empty state */}
      {scheduledHabits.length === 0 && (
        <Card variant="glass" className="text-center">
          <p className="mb-1.5 text-sm text-white/50">
            {habits.length === 0 ? 'Ei vielä tapoja' : `${dateLabel} ei ole ajastettuja tapoja`}
          </p>
          <p className="text-xs leading-normal text-white/30">
            {habits.length === 0
              ? 'Lisää ensimmäinen tapa + napista yläoikealla.'
              : 'Tarkista taparyhmän viikkoasetukset.'}
          </p>
        </Card>
      )}

      {/* List */}
      {scheduledHabits.length > 0 && (
        <div className="flex flex-col gap-2 list-stagger">
          {scheduledHabits.map((habit) => {
            const value = valueFor(habit, selectedDate)
            const goal = habit.goalValue
            const reached = goal > 0 && value >= goal
            const pct = goal > 0 ? Math.min(1, value / goal) : 0
            const isBinary = habit.goalUnit === 'binary'
            return (
              <div
                key={habit.id}
                onClick={() => setDetailId(habit.id)}
                role="button"
                className="relative cursor-pointer overflow-hidden rounded-row border [backdrop-filter:blur(14px)_saturate(150%)] [-webkit-backdrop-filter:blur(14px)_saturate(150%)]"
                style={{
                  backgroundColor: `${habit.color}12`,
                  borderColor: `${habit.color}33`,
                }}
              >
                {/* Glowing color rail */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ background: habit.color, boxShadow: `0 0 12px ${habit.color}` }}
                />
                <div className="px-3.5 pb-3 pt-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {habit.name}
                      </div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-white/40">
                        {value} / {goal}
                        <span className="text-white/25">
                          {' · '}
                          {habit.goalPeriod === 'week' ? 'viikko' : 'päivä'}
                        </span>
                      </div>
                    </div>

                    {/* Action area */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {isBinary ? (
                        <button
                          onClick={() => onSetBinary(habit, !reached, selectedDate)}
                          aria-label={reached ? 'Poista merkintä' : 'Merkitse tehdyksi'}
                          className="flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full p-0"
                          style={{
                            border: reached ? 'none' : `1px solid ${habit.color}66`,
                            backgroundColor: reached ? habit.color : 'transparent',
                            color: reached ? '#05060c' : habit.color,
                          }}
                        >
                          {reached ? <Check size={18} strokeWidth={2.4} /> : null}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => onIncrement(habit, -1, selectedDate)}
                            disabled={value <= 0}
                            aria-label="Vähennä"
                            className={`flex h-8 w-8 min-h-0 min-w-0 items-center justify-center rounded-full border border-white/[0.08] bg-transparent p-0 text-white/60 ${value <= 0 ? 'cursor-not-allowed opacity-30' : ''}`}
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            onClick={() => onIncrement(habit, +1, selectedDate)}
                            aria-label="Kasvata"
                            className="flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full p-0"
                            style={{
                              backgroundColor: reached ? habit.color : `${habit.color}22`,
                              color: reached ? '#05060c' : habit.color,
                            }}
                          >
                            {reached ? <Check size={16} strokeWidth={2.4} /> : <PlusIcon size={16} strokeWidth={2.2} />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline progress bar */}
                  <div className="mt-3 h-1 overflow-hidden rounded-sm bg-white/[0.06]">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct * 100}%`,
                        backgroundColor: habit.color,
                        transition: 'width 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* History button — only when there's at least one habit */}
      {habits.length > 0 && (
        <button
          onClick={() => setShowHistory(true)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-input border border-white/[0.08] bg-surface px-3.5 py-3 text-xs text-accent"
        >
          <BarChart2 size={14} />
          Tilastot
        </button>
      )}

      {/* Create / edit form — bottom sheet */}
      {showCreate && (
        <HabitFormModal
          onSave={(input) => {
            onCreate(input)
            setShowCreate(false)
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <HabitFormModal
          initial={editing}
          onSave={(input) => {
            onUpdate(editing.id, input)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Detail — operates on selectedDate so edits land on the navigated day */}
      {detail && (
        <HabitDetailModal
          habit={detail}
          entries={entries}
          todayValue={valueFor(detail, selectedDate)}
          todayISO={selectedDate}
          onIncrement={(delta) => onIncrement(detail, delta, selectedDate)}
          onSetBinary={(done) => onSetBinary(detail, done, selectedDate)}
          onEdit={() => {
            setEditing(detail)
            setDetailId(null)
          }}
          onArchive={() => {
            if (window.confirm('Arkistoi tapa? Voit palauttaa sen myöhemmin tietokannasta.')) {
              onArchive(detail.id)
              setDetailId(null)
            }
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
