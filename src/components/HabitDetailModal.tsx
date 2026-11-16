import { Plus, Minus, Check } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO } from '../lib/dates'
import { HabitProgressRing } from './HabitProgressRing'
import { Button, Sheet } from './ui'

interface Props {
  habit: Habit
  entries: HabitEntry[]
  todayValue: number
  todayISO: string
  onIncrement: (delta: number) => void
  onSetBinary: (done: boolean) => void
  onEdit: () => void
  onArchive: () => void
  onClose: () => void
}

const textBtn =
  'min-h-10 flex-none cursor-pointer rounded-full px-3 text-[14px] font-semibold'

export function HabitDetailModal({
  habit,
  entries,
  todayValue,
  todayISO,
  onIncrement,
  onSetBinary,
  onEdit,
  onArchive,
  onClose,
}: Props) {
  const goal = habit.goalValue
  const pct = goal > 0 ? Math.min(1, todayValue / goal) : 0
  const reached = todayValue >= goal && goal > 0
  const isBinary = habit.goalUnit === 'binary'

  // Last 7 days strip (oldest → newest, ending today)
  const days: { date: string; value: number; reached: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = addDays(todayISO, -i)
    const e = entries.find((x) => x.habitId === habit.id && x.date === date)
    const v = e?.value ?? 0
    days.push({ date, value: v, reached: v >= goal && goal > 0 })
  }
  const dayLetter = (iso: string) =>
    fromISO(iso).toLocaleDateString('fi-FI', { weekday: 'short' }).slice(0, 2)

  return (
    <Sheet open onClose={onClose}>
      {/* Title row + actions */}
      <div className="mb-2 flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-[24px] font-medium leading-8 text-text">{habit.name}</h2>
          <span className="text-[12px] leading-4 text-fg-muted">
            {habit.goalPeriod === 'day' ? 'Päivätavoite' : 'Viikkotavoite'} {goal}
          </span>
        </div>
        <button onClick={onEdit} className={textBtn} style={{ color: '#22d3ee' }}>
          Muokkaa
        </button>
        <button onClick={onArchive} className={textBtn} style={{ color: '#FFB4AB' }}>
          Arkistoi
        </button>
      </div>

      {/* Progress ring */}
      <div className="flex flex-col items-center gap-3 px-4 pb-2 pt-2">
        <div className="relative h-[200px] w-[200px]">
          <HabitProgressRing value={todayValue} goal={goal} color={habit.color} size={200} strokeWidth={14} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            {reached && <Check size={28} color={habit.color} />}
            <div className="num-display text-[44px] leading-none">
              {isBinary ? (reached ? 'Tehty' : `0 / 1`) : `${todayValue} / ${goal}`}
            </div>
            <div className="text-[12px] leading-4 tabular-nums text-fg-muted">
              {Math.round(pct * 100)} %
            </div>
          </div>
        </div>

        {habit.description && (
          <p className="max-w-[320px] text-center text-[14px] leading-5 text-fg-muted">
            {habit.description}
          </p>
        )}
      </div>

      {/* Counter controls */}
      <div className="py-4">
        {isBinary ? (
          <Button
            variant={reached ? 'secondary' : 'primary'}
            onClick={() => onSetBinary(!reached)}
            className="w-full"
          >
            {reached ? (
              <>
                <Check size={18} />
                Tehty
              </>
            ) : (
              'Merkitse tehdyksi'
            )}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => onIncrement(-1)}
              disabled={todayValue <= 0}
              aria-label="Vähennä"
              className="w-14 px-0"
            >
              <Minus size={20} />
            </Button>
            <Button onClick={() => onIncrement(+1)}>
              <Plus size={18} />
              Lisää
            </Button>
          </div>
        )}
      </div>

      {/* 7-day strip */}
      <div className="flex flex-col gap-2 pb-2">
        <span className="text-[12px] leading-4 text-fg-muted">Viimeiset 7 päivää</span>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <div
              key={d.date}
              className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl"
              style={{
                background: d.reached ? 'rgba(167,139,250,0.28)' : 'var(--surface-2)',
                outline: d.date === todayISO ? `2px solid ${habit.color}` : 'none',
                outlineOffset: '-2px',
              }}
            >
              <span className="text-[12px] leading-4 text-fg-muted">{dayLetter(d.date)}</span>
              {d.reached ? (
                <Check size={14} color="#DEE3E5" aria-label="tehty" />
              ) : (
                <span className="text-[14px] font-medium leading-5 tabular-nums text-text">{d.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
