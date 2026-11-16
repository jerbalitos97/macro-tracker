import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, toISO } from '../lib/dates'

import { Card, Chip } from '../components/ui'

const iconBtn = 'flex h-12 w-12 min-h-0 min-w-0 flex-none items-center justify-center rounded-full text-text'

interface Props {
  habits: Habit[]
  entries: HabitEntry[]
  onClose: () => void
}

const DAY_HEADERS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']
const MONTH_NAMES = [
  'tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu',
]

// Monday=0 .. Sunday=6 — locale convention used by the rest of the app
const dowMondayFirst = (iso: string): number => {
  const d = fromISO(iso).getDay() // 0=Sun .. 6=Sat
  return (d + 6) % 7
}

// Monday of the week containing `iso`
const weekStart = (iso: string): string => {
  const offset = -dowMondayFirst(iso)
  return addDays(iso, offset)
}

export function HabitsHistoryView({ habits, entries, onClose }: Props) {
  const today = toISO(new Date())
  const todayDate = fromISO(today)
  const [year, setYear] = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth())
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedHabit = selectedId === null ? null : habits.find((h) => h.id === selectedId) ?? null

  // ── Completion helpers ─────────────────────────────────────────
  // "Did this habit have activity (any entry > 0) on this date?"
  const dayHasActivity = (habit: Habit, date: string): boolean => {
    const v = entries.find((e) => e.habitId === habit.id && e.date === date)?.value ?? 0
    return v > 0
  }

  // "Is the habit's period goal met for this date?"
  //   day habit:  this day's value >= goal
  //   week habit: this week's cumulative >= goal (week of date)
  const periodGoalMet = (habit: Habit, date: string): boolean => {
    if (habit.goalValue <= 0) return false
    if (habit.goalPeriod === 'day') {
      const v = entries.find((e) => e.habitId === habit.id && e.date === date)?.value ?? 0
      return v >= habit.goalValue
    }
    const ws = weekStart(date)
    const sum = entries
      .filter((e) => e.habitId === habit.id && e.date >= ws && e.date <= addDays(ws, 6))
      .reduce((s, e) => s + e.value, 0)
    return sum >= habit.goalValue
  }

  // What we show in the cell for a single habit:
  //   activity: did the user do something today? (drives the fill)
  //   crown:    does this day deserve a crown? (drives the crown badge)
  //
  // For day habits crown == activity meeting the daily goal.
  // For week habits we crown every active day in a fully-met week — so the
  // user sees clearly which days contributed to a successful week.
  const cellFor = (habit: Habit, date: string): { activity: boolean; crown: boolean } => {
    const active = dayHasActivity(habit, date)
    if (habit.goalPeriod === 'day') {
      return { activity: active, crown: periodGoalMet(habit, date) }
    }
    return { activity: active, crown: active && periodGoalMet(habit, date) }
  }

  const completionForDate = (date: string): { activity: number; crowns: number; total: number; ratio: number } => {
    const dow = dowMondayFirst(date)
    const sunFirstDow = (dow + 1) % 7
    const scheduled = selectedHabit
      ? [selectedHabit]
      : habits.filter((h) => h.taskDays.includes(sunFirstDow))
    if (scheduled.length === 0) return { activity: 0, crowns: 0, total: 0, ratio: 0 }
    let activity = 0
    let crowns = 0
    for (const h of scheduled) {
      const c = cellFor(h, date)
      if (c.activity) activity++
      if (c.crown) crowns++
    }
    return { activity, crowns, total: scheduled.length, ratio: activity / scheduled.length }
  }

  // ── Calendar cell layout ───────────────────────────────────────
  // 42 cells: from Monday-of-the-week containing the 1st through 6 weeks.
  const monthCells = useMemo(() => {
    const firstOfMonth = toISO(new Date(year, month, 1))
    const gridStart = weekStart(firstOfMonth)
    const cells: Array<{ date: string; inMonth: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i)
      const d = fromISO(date)
      cells.push({ date, inMonth: d.getMonth() === month && d.getFullYear() === year })
    }
    return cells
  }, [year, month])

  // ── Stats for the visible month ────────────────────────────────
  // Rate is goal-completion-based (crowns / scheduled), so a 3/week habit
  // contributes credit on every active day of a fully-met week. Perfect days
  // require every scheduled habit to be crown-worthy.
  const stats = useMemo(() => {
    const inMonth = monthCells.filter((c) => c.inMonth && c.date <= today)
    let perfect = 0
    let totalSlots = 0
    let totalCrowns = 0
    for (const c of inMonth) {
      const r = completionForDate(c.date)
      if (r.total === 0) continue
      totalSlots += r.total
      totalCrowns += r.crowns
      if (r.crowns === r.total) perfect++
    }
    const rate = totalSlots > 0 ? (totalCrowns / totalSlots) * 100 : 0
    let bestStreak = 0
    let curStreak = 0
    for (const c of inMonth) {
      const r = completionForDate(c.date)
      if (r.total > 0 && r.crowns === r.total) {
        curStreak++
        if (curStreak > bestStreak) bestStreak = curStreak
      } else if (r.total > 0) {
        curStreak = 0
      }
    }
    return { perfect, rate, bestStreak }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthCells, habits, entries, selectedId])

  // ── Month nav ──────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const accent = selectedHabit?.color ?? '#22d3ee'

  return (
    <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-2">
      {/* Sub-screen header: back + context (the AppBar carries the tool name) */}
      <div className="flex items-center gap-1">
        <button onClick={onClose} className={iconBtn} aria-label="Takaisin">
          <ChevronLeft size={24} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[18px] font-medium leading-6 text-text">Tilastot</h2>
          <p className="truncate text-[14px] leading-5 text-fg-muted">
            {selectedHabit ? selectedHabit.name : 'Yhteenveto kaikista'}
          </p>
        </div>
      </div>

      {/* Habit filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <Chip active={selectedId === null} onClick={() => setSelectedId(null)} className="min-h-9 flex-shrink-0 whitespace-nowrap">
          Kaikki
        </Chip>
        {habits.map((h) => (
          <Chip
            key={h.id}
            active={selectedId === h.id}
            onClick={() => setSelectedId(h.id)}
            className="min-h-9 flex-shrink-0 whitespace-nowrap"
          >
            <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: h.color }} />
            {h.name}
          </Chip>
        ))}
      </div>

      <Card variant="panel" className="flex flex-col gap-2.5 p-4">
        {/* Month nav */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className={iconBtn} aria-label="Edellinen kuukausi">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 text-center text-[18px] font-medium capitalize leading-6 text-text">
            {MONTH_NAMES[month]} {year}
          </div>
          <button onClick={nextMonth} className={iconBtn} aria-label="Seuraava kuukausi">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-[12px] leading-4 text-fg-muted">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {monthCells.map((c) => {
            const r = completionForDate(c.date)
            const isToday = c.date === today
            const isPast = c.date <= today
            const dayNum = fromISO(c.date).getDate()
            const perfect = r.total > 0 && r.crowns === r.total

            // Fill driven by activity ratio (which days had progress logged).
            // Crown is driven separately by period-goal completion.
            const fillOpacity = r.total === 0 ? 0 : r.ratio === 0 ? 0 : Math.max(0.18, r.ratio * 0.72)
            const fillColor =
              r.activity > 0 ? `${accent}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}` : 'var(--surface-2)'

            return (
              <div
                key={c.date}
                className="relative flex aspect-square flex-col items-center justify-center rounded-[10px]"
                style={{
                  outline: isToday ? `2px solid ${accent}` : 'none',
                  outlineOffset: '-2px',
                  backgroundColor: c.inMonth ? (isPast ? fillColor : 'var(--surface-2)') : 'transparent',
                  opacity: c.inMonth ? (isPast ? 1 : 0.4) : 0.25,
                }}
              >
                {perfect && c.inMonth && isPast && (
                  <Crown
                    size={12}
                    color="#fde68a"
                    fill="#fde68a"
                    aria-hidden
                    className="absolute right-0.5 top-0.5"
                  />
                )}
                <span className="text-[12px] leading-4 tabular-nums text-text">
                  {dayNum}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Monthly stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={`${stats.rate.toFixed(0)} %`} label="Täyttöaste" />
        <StatTile value={`${stats.perfect}`} label="Täydelliset" />
        <StatTile value={`${stats.bestStreak} pv`} label="Pisin putki" />
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card variant="panel" className="flex flex-col gap-0.5 p-3.5">
      <span className="text-[12px] leading-4 text-fg-muted">{label}</span>
      <span className="text-[22px] font-medium leading-7 tabular-nums text-text">{value}</span>
    </Card>
  )
}
