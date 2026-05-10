import { useMemo, useState } from 'react'
import { Plus, Check, Minus, Plus as PlusIcon } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO, getWeekdayNum, toISO } from '../lib/dates'
import { HabitFormModal } from '../components/HabitFormModal'
import { HabitDetailModal } from '../components/HabitDetailModal'
import { s } from '../styles/tokens'

interface Props {
  habits: Habit[]
  entries: HabitEntry[]
  onCreate: (input: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'isArchived' | 'habitType' | 'taskDays'>) => void
  onUpdate: (id: number, patch: Partial<Habit>) => void
  onArchive: (id: number) => void
  onIncrement: (habit: Habit, delta: number) => void
  onSetBinary: (habit: Habit, done: boolean) => void
}

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
  const today = fromISO(todayISO)
  const todayDow = getWeekdayNum(todayISO)

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  const detail = detailId !== null ? habits.find((h) => h.id === detailId) ?? null : null

  // Habits scheduled for today (per task_days)
  const todayHabits = useMemo(
    () => habits.filter((h) => h.taskDays.includes(todayDow)),
    [habits, todayDow],
  )

  // Compute current value for a habit (today's count, or this week's sum for week habits)
  const valueFor = (habit: Habit): number => {
    if (habit.goalPeriod === 'week') {
      const wStart = weekStart(todayISO)
      return entries
        .filter((e) => e.habitId === habit.id && e.date >= wStart && e.date <= todayISO)
        .reduce((sum, e) => sum + e.value, 0)
    }
    const e = entries.find((x) => x.habitId === habit.id && x.date === todayISO)
    return e?.value ?? 0
  }

  const dateLabel = today.toLocaleDateString('fi-FI', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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

      {/* Empty state */}
      {todayHabits.length === 0 && (
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '32px 16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            {habits.length === 0 ? 'Ei vielä tapoja' : 'Tänään ei ole ajastettuja tapoja'}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
            {habits.length === 0
              ? 'Lisää ensimmäinen tapa + napista yläoikealla.'
              : 'Tarkista taparyhmän viikkoasetukset.'}
          </p>
        </div>
      )}

      {/* List */}
      {todayHabits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="list-stagger">
          {todayHabits.map((habit) => {
            const value = valueFor(habit)
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
                          onClick={() => onSetBinary(habit, !reached)}
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
                            onClick={() => onIncrement(habit, -1)}
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
                            onClick={() => onIncrement(habit, +1)}
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

      {/* Detail */}
      {detail && (
        <HabitDetailModal
          habit={detail}
          entries={entries}
          todayValue={valueFor(detail)}
          todayISO={todayISO}
          onIncrement={(delta) => onIncrement(detail, delta)}
          onSetBinary={(done) => onSetBinary(detail, done)}
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
