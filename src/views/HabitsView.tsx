import { useMemo, useState } from 'react'
import { Plus, Check, ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, getWeekdayNum, toISO } from '../lib/dates'
import { HabitFormModal } from '../components/HabitFormModal'
import { HabitDetailModal } from '../components/HabitDetailModal'
import { HabitsHistoryView } from './HabitsHistoryView'
import { Button, Card, DragItem, useDragReorder, moveById, moveByDelta } from '../components/ui'
import { celebrate } from '../lib/flash'

interface Props {
  habits: Habit[]
  entries: HabitEntry[]
  onCreate: (input: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'isArchived' | 'habitType' | 'taskDays'>) => void
  onUpdate: (id: number, patch: Partial<Habit>) => void
  onArchive: (id: number) => void
  onIncrement: (habit: Habit, delta: number, date: string) => void
  onSetBinary: (habit: Habit, done: boolean, date: string) => void
  /** Receives the full habit list in its new order. */
  onReorder: (habits: Habit[]) => void
}

const DAY_LETTERS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']

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
  onReorder,
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

  // Only the habits scheduled today are on screen, so a drag reorders a subset.
  // The moved habits go back into the same slots the subset occupied in the full
  // list, leaving habits hidden by the weekday filter exactly where they were.
  const applyOrder = (nextVisible: Habit[]) => {
    if (nextVisible === scheduledHabits) return
    const queue = [...nextVisible]
    const visible = new Set(scheduledHabits.map((h) => h.id))
    onReorder(habits.map((h) => (visible.has(h.id) ? queue.shift()! : h)))
  }

  const reorder = useDragReorder((fromId, toId) => applyOrder(moveById(scheduledHabits, fromId, toId)))

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

  const doneCount = scheduledHabits.filter((h) => h.goalValue > 0 && valueFor(h, selectedDate) >= h.goalValue).length
  const dueCount = scheduledHabits.length
  const allDone = dueCount > 0 && doneCount === dueCount
  const heroTitle = allDone ? 'Täydellinen päivä' : doneCount === 0 ? 'Aloitetaan' : 'Hyvällä matkalla'
  const heroSub = allDone ? 'Kaikki tavat tehty' : `${dueCount - doneCount} tapaa jäljellä`
  const HERO_C = 2 * Math.PI * 50
  const ROW_C = 2 * Math.PI * 21

  return (
    <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+176px)] pt-2">
      {/* Hero: the day's one number */}
      {dueCount > 0 && (
        <section
          className="flex items-center gap-[18px] border p-5"
          style={{
            borderRadius: '36px 36px 36px 12px',
            background: 'linear-gradient(135deg, rgba(167,139,250,0.34), rgba(34,211,238,0.22))',
            borderColor: 'rgba(167,139,250,0.4)',
          }}
        >
          <div className="relative h-[116px] w-[116px] flex-none">
            <svg width="116" height="116" viewBox="0 0 116 116" role="img" aria-label={`${doneCount} / ${dueCount} tapaa tehty`}>
              <defs>
                <linearGradient id="habits-hero-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <circle cx="58" cy="58" r="50" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
              <circle
                cx="58" cy="58" r="50" fill="none" stroke="url(#habits-hero-g)" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(doneCount / dueCount) * HERO_C} ${HERO_C}`}
                transform="rotate(-90 58 58)"
                style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.34,1.3,.64,1)', filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.5))' }}
              />
            </svg>
            <span aria-hidden className="num-display absolute inset-0 flex items-center justify-center text-[36px]">
              {doneCount}/{dueCount}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[14px] leading-5 text-[#e7e2f3]">{dateLabel}</span>
            <span className="text-[24px] font-medium leading-[30px] text-text">{heroTitle}</span>
            <span className="text-[14px] leading-5 text-[#e7e2f3]">{heroSub}</span>
          </div>
        </section>
      )}

      {/* Week strip — tap a day to backfill entries on that date */}
      <div className="flex items-center gap-1">
        <button
          onClick={goPrevWeek}
          aria-label="Edellinen viikko"
          className="flex h-12 w-11 min-h-0 min-w-0 items-center justify-center rounded-full text-text"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="flex-1 text-center text-[14px] font-medium text-text tabular-nums">
          {fromISO(stripWeekStart).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
          {' – '}
          {fromISO(addDays(stripWeekStart, 6)).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
        </span>
        <button
          onClick={goNextWeek}
          aria-label="Seuraava viikko"
          disabled={!canGoNextWeek}
          className={`flex h-12 w-11 min-h-0 min-w-0 items-center justify-center rounded-full text-text ${canGoNextWeek ? '' : 'opacity-35'}`}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="flex gap-1">
        {weekDays.map((d, i) => {
          const c = completionFor(d)
          const isSelected = d === selectedDate
          const isToday = d === todayISO
          const isFuture = d > todayISO
          const dayNum = fromISO(d).getDate()
          return (
            <button
              key={d}
              onClick={() => !isFuture && setSelectedDate(d)}
              disabled={isFuture}
              aria-label={`${fromISO(d).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' })}, ${Math.round(c.ratio * 100)} % tavoista tehty`}
              aria-pressed={isSelected}
              className={`relative flex min-h-[76px] min-w-0 flex-1 flex-col items-center justify-end gap-1 overflow-hidden rounded-[18px] bg-[var(--surface-1)] px-0 pb-2 pt-1.5 text-text ${isFuture ? 'cursor-default opacity-40' : 'cursor-pointer'}`}
              style={isSelected ? { outline: '2px solid #22d3ee', outlineOffset: '-2px' } : undefined}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: `${isFuture ? 0 : Math.round(c.ratio * 100)}%`,
                  background: 'linear-gradient(0deg, rgba(167,139,250,0.55), rgba(34,211,238,0.35))',
                  transition: 'height 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <span className="relative text-[12px] leading-4 text-fg-muted">{DAY_LETTERS[i]}</span>
              <span className={`relative text-[18px] font-medium leading-6 tabular-nums ${isToday ? 'text-accent' : ''}`}>{dayNum}</span>
              <span className="relative flex h-3.5 items-center">
                {c.perfect && !isFuture && <Crown size={12} color="#fde68a" fill="#fde68a" aria-hidden />}
              </span>
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {scheduledHabits.length === 0 && (
        <Card variant="panel" className="flex flex-col items-center gap-1 px-4 py-7 text-center">
          <p className="text-[16px] font-medium leading-6 text-text">
            {habits.length === 0 ? 'Ei vielä tapoja' : `${dateLabel} ei ole ajastettuja tapoja`}
          </p>
          <p className="text-[14px] leading-5 text-fg-muted">
            {habits.length === 0
              ? 'Lisää ensimmäinen tapa Uusi tapa -napista.'
              : 'Tarkista taparyhmän viikkoasetukset.'}
          </p>
        </Card>
      )}

      {/* List */}
      {scheduledHabits.length > 0 && (
        <div ref={reorder.containerRef} className="list-stagger flex flex-col gap-[2px] overflow-hidden rounded-[20px]">
          {scheduledHabits.map((habit) => {
            const value = valueFor(habit, selectedDate)
            const goal = habit.goalValue
            const reached = goal > 0 && value >= goal
            const pct = goal > 0 ? Math.min(1, value / goal) : 0
            const isBinary = habit.goalUnit === 'binary'
            const meta = isBinary
              ? (reached ? 'Tehty' : 'Ei vielä')
              : `${value} / ${goal} · ${habit.goalPeriod === 'week' ? 'viikko' : 'päivä'}`
            return (
              <DragItem
                key={habit.id}
                id={String(habit.id)}
                reorder={reorder}
                longPress
                onActivate={() => setDetailId(habit.id)}
                onMove={(d) => applyOrder(moveByDelta(scheduledHabits, habit.id, d))}
                role="button"
                tabIndex={0}
                ariaLabel={`${habit.name}, ${value} / ${goal}`}
                flashTint={habit.color}
                className="flex min-h-[72px] cursor-pointer items-center gap-3 bg-[var(--surface-1)] py-2.5 pr-1"
              >
                <span
                  aria-hidden
                  className="w-1 self-stretch rounded-r"
                  style={{ background: habit.color }}
                />
                <div
                  className="flex min-w-0 flex-1 flex-col gap-1"
                  style={{ opacity: reached ? 0.6 : 1, transition: 'opacity 200ms' }}
                >
                  <span className="truncate text-[16px] leading-[22px] text-text">{habit.name}</span>
                  <span className="text-[12px] leading-4 tabular-nums text-fg-muted">{meta}</span>
                </div>

                {isBinary || reached ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isBinary) {
                        onSetBinary(habit, !reached, selectedDate)
                        // Vain tehdyksi merkintä juhlitaan. Merkinnän
                        // poisto on korjaus, ja korjauksen palkitseminen
                        // tekisi molemmista yhtä merkityksettömiä.
                        if (!reached) celebrate(e.currentTarget, habit.color)
                      } else {
                        onIncrement(habit, +1, selectedDate)
                      }
                    }}
                    aria-label={isBinary
                      ? (reached ? `${habit.name}: poista merkintä` : `${habit.name}: merkitse tehdyksi`)
                      : `${habit.name}: tavoite täynnä, lisää silti 1`}
                    className="flex h-11 w-11 min-h-0 min-w-0 flex-none items-center justify-center rounded-full p-0 text-bg"
                    style={reached
                      ? { background: 'linear-gradient(135deg, #22d3ee, #a78bfa)' }
                      : { border: '2px solid rgba(255,255,255,0.3)' }}
                  >
                    {reached && <Check size={20} strokeWidth={3} />}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onIncrement(habit, +1, selectedDate)
                      // Juhlitaan tavoitteen täyttyminen, ei jokaista
                      // askelta sitä kohti.
                      if (value + 1 >= goal) celebrate(e.currentTarget, habit.color)
                    }}
                    aria-label={`${habit.name}: lisää 1, nyt ${value} / ${goal}`}
                    className="relative flex h-12 w-12 min-h-0 min-w-0 flex-none items-center justify-center rounded-full p-0"
                  >
                    {/* Edistyminen renkaana napin ympärillä; nappi on tarkoituksella tyhjä (palaute #11), toiminto kuuluu aria-labelissa. */}
                    <svg aria-hidden width="48" height="48" viewBox="0 0 48 48" className="absolute inset-0">
                      <circle cx="24" cy="24" r="21" fill="rgba(34,211,238,0.12)" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                      <circle
                        cx="24" cy="24" r="21" fill="none" stroke={habit.color} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={`${pct * ROW_C} ${ROW_C}`}
                        transform="rotate(-90 24 24)"
                        style={{ transition: 'stroke-dasharray 400ms cubic-bezier(.2,0,0,1)' }}
                      />
                    </svg>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetailId(habit.id)
                  }}
                  aria-label={`Tiedot: ${habit.name}`}
                  className="flex h-12 w-11 min-h-0 min-w-0 flex-none items-center justify-center rounded-full p-0 text-fg-muted"
                >
                  <ChevronRight size={20} />
                </button>
              </DragItem>
            )
          })}
        </div>
      )}

      {/* History button — only when there's at least one habit */}
      {habits.length > 0 && (
        <Button variant="ghost" onClick={() => setShowHistory(true)} className="mt-1 self-center">
          Tilastot
        </Button>
      )}

      {/* Extended FAB above the navigation bar */}
      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-[max(16px,calc((100vw-480px)/2+16px))] z-20 flex h-14 items-center gap-2.5 rounded-2xl bg-gradient-to-br from-violet to-cyan pl-4 pr-5 text-[16px] font-semibold text-bg shadow-[0_10px_28px_-8px_rgba(167,139,250,0.65)]"
      >
        <Plus size={22} strokeWidth={2.4} />
        Uusi tapa
      </button>

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
