import { useMemo, useState } from 'react'
import { Plus, Check, Minus, Plus as PlusIcon, BarChart2, ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, getWeekdayNum, toISO } from '../lib/dates'
import { HabitFormModal } from '../components/HabitFormModal'
import { HabitDetailModal } from '../components/HabitDetailModal'
import { HabitsHistoryView } from './HabitsHistoryView'
import { s } from '../styles/tokens'

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

  // Inline form view replaces the list when creating or editing.
  // Avoids fighting iOS Safari over bottom-sheet modal scrolling.
  if (showCreate) {
    return (
      <HabitFormModal
        onSave={(input) => {
          onCreate(input)
          setShowCreate(false)
        }}
        onClose={() => setShowCreate(false)}
      />
    )
  }
  if (editing) {
    return (
      <HabitFormModal
        initial={editing}
        onSave={(input) => {
          onUpdate(editing.id, input)
          setEditing(null)
        }}
        onClose={() => setEditing(null)}
      />
    )
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
    <div style={s.content}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          ...s.dateHeader,
        }}
      >
        <div>
          <div style={s.dateMain}>Tavat</div>
          <div style={s.dateSub}>{dateLabel}</div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="Lisää tapa"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#d4b85a',
            color: '#0a0a0a',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <Plus size={20} strokeWidth={2.4} />
        </button>
      </div>

      {/* Week strip — tap a day to backfill entries on that date */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <button
            onClick={goPrevWeek}
            aria-label="Edellinen viikko"
            style={{ ...s.iconBtn, color: 'rgba(255,255,255,0.55)' }}
          >
            <ChevronLeft size={16} />
          </button>
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: "ui-monospace, 'SF Mono', monospace",
            }}
          >
            {fromISO(stripWeekStart).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
            {' – '}
            {fromISO(addDays(stripWeekStart, 6)).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
          </div>
          <button
            onClick={goNextWeek}
            aria-label="Seuraava viikko"
            disabled={!canGoNextWeek}
            style={{ ...s.iconBtn, color: 'rgba(255,255,255,0.55)', opacity: canGoNextWeek ? 1 : 0.25 }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {weekDays.map((d, i) => {
            const c = completionFor(d)
            const isSelected = d === selectedDate
            const isToday = d === todayISO
            const isFuture = d > todayISO
            const dayNum = fromISO(d).getDate()
            const fillOpacity = c.total === 0 ? 0 : c.ratio === 0 ? 0 : Math.max(0.18, c.ratio * 0.7)
            const fillBg = c.ratio > 0
              ? `rgba(212, 184, 90, ${fillOpacity})`
              : 'transparent'
            return (
              <button
                key={d}
                onClick={() => !isFuture && setSelectedDate(d)}
                disabled={isFuture}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: isFuture ? 'not-allowed' : 'pointer',
                  opacity: isFuture ? 0.3 : 1,
                  minHeight: 'auto',
                  minWidth: 'auto',
                }}
                aria-label={d}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "ui-monospace, 'SF Mono', monospace",
                    color: isSelected ? '#d4b85a' : 'rgba(255,255,255,0.4)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {DAY_LETTERS[i]}
                </div>
                <div
                  style={{
                    position: 'relative',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: isSelected
                      ? '1.5px solid #d4b85a'
                      : isToday
                        ? '1px solid rgba(212,184,90,0.4)'
                        : '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: fillBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {c.perfect && (
                    <Crown
                      size={9}
                      color="#d4b85a"
                      fill="#d4b85a"
                      style={{ position: 'absolute', top: -3, right: -2 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected || isToday ? 700 : 500,
                      color: isSelected ? '#fff' : isToday ? '#d4b85a' : '#ebebeb',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1,
                    }}
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
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '32px 16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            {habits.length === 0 ? 'Ei vielä tapoja' : `${dateLabel} ei ole ajastettuja tapoja`}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
            {habits.length === 0
              ? 'Lisää ensimmäinen tapa + napista yläoikealla.'
              : 'Tarkista taparyhmän viikkoasetukset.'}
          </p>
        </div>
      )}

      {/* List */}
      {scheduledHabits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="list-stagger">
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
                style={{
                  ...s.card,
                  padding: 0,
                  cursor: 'pointer',
                  borderLeft: `3px solid ${habit.color}`,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div style={{ padding: '14px 14px 12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {habit.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.4)',
                          marginTop: 2,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {value} / {goal}
                        <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {' · '}
                          {habit.goalPeriod === 'week' ? 'viikko' : 'päivä'}
                        </span>
                      </div>
                    </div>

                    {/* Action area */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isBinary ? (
                        <button
                          onClick={() => onSetBinary(habit, !reached, selectedDate)}
                          aria-label={reached ? 'Poista merkintä' : 'Merkitse tehdyksi'}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            border: reached ? 'none' : `1px solid ${habit.color}66`,
                            backgroundColor: reached ? habit.color : 'transparent',
                            color: reached ? '#0a0a0a' : habit.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            minWidth: 0,
                            minHeight: 0,
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
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              border: '1px solid rgba(255,255,255,0.08)',
                              backgroundColor: 'transparent',
                              color: 'rgba(255,255,255,0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: value <= 0 ? 'not-allowed' : 'pointer',
                              opacity: value <= 0 ? 0.3 : 1,
                              padding: 0,
                              minWidth: 0,
                              minHeight: 0,
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            onClick={() => onIncrement(habit, +1, selectedDate)}
                            aria-label="Kasvata"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              border: 'none',
                              backgroundColor: reached ? habit.color : `${habit.color}22`,
                              color: reached ? '#0a0a0a' : habit.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              minWidth: 0,
                              minHeight: 0,
                            }}
                          >
                            {reached ? <Check size={16} strokeWidth={2.4} /> : <PlusIcon size={16} strokeWidth={2.2} />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline progress bar */}
                  <div
                    style={{
                      marginTop: 12,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
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
          style={{
            ...s.actionBtn,
            width: '100%',
            marginTop: 16,
            padding: '12px 14px',
            color: '#d4b85a',
          }}
        >
          <BarChart2 size={14} />
          Tilastot
        </button>
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
