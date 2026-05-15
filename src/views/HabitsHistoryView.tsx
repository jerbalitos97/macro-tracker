import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Crown, Flame, CalendarCheck } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, toISO } from '../lib/dates'
import { s } from '../styles/tokens'

interface Props {
  habits: Habit[]
  entries: HabitEntry[]
  onClose: () => void
}

const DAY_HEADERS = ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU']
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
  const valueForHabitOnDate = (habit: Habit, date: string): number => {
    if (habit.goalPeriod === 'week') {
      const ws = weekStart(date)
      return entries
        .filter((e) => e.habitId === habit.id && e.date >= ws && e.date <= addDays(ws, 6))
        .reduce((sum, e) => sum + e.value, 0)
    }
    return entries.find((e) => e.habitId === habit.id && e.date === date)?.value ?? 0
  }

  const completionForDate = (date: string): { hit: number; total: number; ratio: number; anyLogged: boolean } => {
    const dow = dowMondayFirst(date)
    // taskDays uses Sun=0..Sat=6; convert from our Mon-first dow
    const sunFirstDow = (dow + 1) % 7
    const scheduled = selectedHabit
      ? [selectedHabit]
      : habits.filter((h) => h.taskDays.includes(sunFirstDow))
    if (scheduled.length === 0) return { hit: 0, total: 0, ratio: 0, anyLogged: false }
    let hit = 0
    let anyLogged = false
    for (const h of scheduled) {
      const v = valueForHabitOnDate(h, date)
      if (v > 0) anyLogged = true
      if (h.goalValue > 0 && v >= h.goalValue) hit++
    }
    return { hit, total: scheduled.length, ratio: hit / scheduled.length, anyLogged }
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
  const stats = useMemo(() => {
    const inMonth = monthCells.filter((c) => c.inMonth && c.date <= today)
    let perfect = 0
    let totalSlots = 0
    let totalHits = 0
    for (const c of inMonth) {
      const r = completionForDate(c.date)
      if (r.total === 0) continue
      totalSlots += r.total
      totalHits += r.hit
      if (r.hit === r.total) perfect++
    }
    const rate = totalSlots > 0 ? (totalHits / totalSlots) * 100 : 0
    // Best streak of perfect days in the visible month
    let bestStreak = 0
    let curStreak = 0
    for (const c of inMonth) {
      const r = completionForDate(c.date)
      if (r.total > 0 && r.hit === r.total) {
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

  const accent = selectedHabit?.color ?? '#d4b85a'

  return (
    <div style={s.content}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onClose} style={{ ...s.iconBtn, color: '#fff' }} aria-label="Takaisin">
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.dateMain}>Tilastot</div>
          <div style={s.dateSub}>{selectedHabit ? selectedHabit.name : 'Yhteenveto kaikista'}</div>
        </div>
      </div>

      {/* Habit filter chips */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 14,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <FilterChip
          label="Kaikki"
          color="#d4b85a"
          active={selectedId === null}
          onClick={() => setSelectedId(null)}
        />
        {habits.map((h) => (
          <FilterChip
            key={h.id}
            label={h.name}
            color={h.color}
            active={selectedId === h.id}
            onClick={() => setSelectedId(h.id)}
          />
        ))}
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prevMonth} style={{ ...s.iconBtn, color: '#fff' }} aria-label="Edellinen kuukausi">
          <ChevronLeft size={18} />
        </button>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            textTransform: 'capitalize',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {MONTH_NAMES[month]} {year}
        </div>
        <button onClick={nextMonth} style={{ ...s.iconBtn, color: '#fff' }} aria-label="Seuraava kuukausi">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 9,
              color: '#555',
              letterSpacing: '0.08em',
              padding: '4px 0',
              fontFamily: "ui-monospace, 'SF Mono', monospace",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {monthCells.map((c) => {
          const r = completionForDate(c.date)
          const isToday = c.date === today
          const isPast = c.date <= today
          const dayNum = fromISO(c.date).getDate()
          const perfect = r.total > 0 && r.hit === r.total

          // Fill opacity scales with completion ratio
          const fillOpacity = r.total === 0 ? 0 : Math.max(0.12, r.ratio)
          const fillColor = `${accent}${Math.round(fillOpacity * 255).toString(16).padStart(2, '0')}`

          return (
            <div
              key={c.date}
              style={{
                aspectRatio: '1',
                borderRadius: '50%',
                border: isToday
                  ? `1.5px solid ${accent}`
                  : c.inMonth
                    ? '1px solid rgba(255,255,255,0.05)'
                    : '1px solid transparent',
                backgroundColor: c.inMonth && r.total > 0 ? fillColor : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                opacity: c.inMonth ? (isPast ? 1 : 0.5) : 0.18,
              }}
            >
              {perfect && (
                <Crown
                  size={9}
                  color={accent}
                  fill={accent}
                  style={{ position: 'absolute', top: -3, right: -2 }}
                />
              )}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: perfect ? 700 : 500,
                  color: r.ratio > 0.5 ? '#fff' : c.inMonth ? '#ebebeb' : '#444',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {dayNum}
              </div>
            </div>
          )
        })}
      </div>

      {/* Monthly stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
        <StatTile
          icon={<CalendarCheck size={14} color={accent} />}
          value={`${stats.rate.toFixed(0)} %`}
          label="Kuukauden täyttöaste"
          accent={accent}
        />
        <StatTile
          icon={<Crown size={14} color={accent} />}
          value={`${stats.perfect}`}
          label="Täydellistä päivää"
          accent={accent}
        />
        <StatTile
          icon={<Flame size={14} color={accent} />}
          value={`${stats.bestStreak}`}
          label="Pisin putki"
          accent={accent}
        />
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 16,
        backgroundColor: active ? `${color}22` : 'rgba(255,255,255,0.04)',
        border: active ? `1px solid ${color}66` : '1px solid rgba(255,255,255,0.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minHeight: 'auto',
        minWidth: 'auto',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  )
}

function StatTile({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode
  value: string
  label: string
  accent: string
}) {
  return (
    <div
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: '10px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 4 }}>{icon}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: accent,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 2,
          fontFamily: "ui-monospace, 'SF Mono', monospace",
        }}
      >
        {label}
      </div>
    </div>
  )
}
