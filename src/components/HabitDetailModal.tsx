import { useState } from 'react'
import { MoreHorizontal, Plus, Minus, Check, Pencil, Archive } from 'lucide-react'
import type { Habit, HabitEntry } from '../types'
import { addDays, fromISO } from '../lib/dates'
import { HabitProgressRing } from './HabitProgressRing'
import { Sheet } from './ui'

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

const counterBtn =
  'flex h-12 w-12 min-h-0 min-w-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] p-0 text-text'
const menuItem =
  'flex w-full min-h-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-[13px] text-[#ebebeb]'

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
  const [menuOpen, setMenuOpen] = useState(false)

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
    fromISO(iso).toLocaleDateString('fi-FI', { weekday: 'narrow' }).toUpperCase()

  return (
    <Sheet open onClose={onClose}>
      {/* Title row + overflow menu */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-text">
            {habit.name}
          </div>
          <div className="mt-0.5 text-[10px] text-white/40">
            {habit.goalPeriod === 'day' ? 'Päivätavoite' : 'Viikkotavoite'}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-text"
            aria-label="Lisätoiminnot"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[1]" />
              <div className="absolute right-0 top-[38px] z-[2] min-w-[160px] rounded-glass border border-white/10 bg-modal p-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                  className={menuItem}
                >
                  <Pencil size={13} />
                  Muokkaa
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onArchive()
                  }}
                  className={`${menuItem} text-danger`}
                >
                  <Archive size={13} />
                  Arkistoi
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress ring */}
      <div className="flex flex-col items-center px-4 pb-4 pt-2">
        <div className="relative h-[200px] w-[200px]">
          <HabitProgressRing value={todayValue} goal={goal} color={habit.color} size={200} strokeWidth={14} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {reached && <Check size={28} color={habit.color} className="mb-1" />}
            <div className="font-display text-[38px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text">
              {todayValue}
              <span className="text-[22px] font-semibold text-[#555]"> / {goal}</span>
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.1em] text-white/40">
              {Math.round(pct * 100)} %
            </div>
          </div>
        </div>

        {habit.description && (
          <p className="mt-3.5 max-w-[320px] text-center text-xs leading-normal text-white/50">
            {habit.description}
          </p>
        )}
      </div>

      {/* Counter controls */}
      <div className="px-4 py-4">
        {isBinary ? (
          <button
            onClick={() => onSetBinary(!reached)}
            className="flex w-full items-center justify-center gap-2 rounded-input p-4 text-sm font-bold tracking-[0.02em]"
            style={{
              backgroundColor: reached ? habit.color : 'rgba(255,255,255,0.06)',
              color: reached ? '#05060c' : '#ebebeb',
            }}
          >
            {reached ? (
              <>
                <Check size={16} />
                Tehty
              </>
            ) : (
              'Merkitse tehdyksi'
            )}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-[18px]">
            <button
              onClick={() => onIncrement(-1)}
              disabled={todayValue <= 0}
              className={`${counterBtn} ${todayValue <= 0 ? 'opacity-30' : ''}`}
              aria-label="Vähennä"
            >
              <Minus size={20} />
            </button>
            <button
              onClick={() => onIncrement(+1)}
              className="flex min-h-0 items-center gap-2 rounded-input px-7 py-3.5 text-[13px] font-bold tracking-[0.03em] text-bg"
              style={{ backgroundColor: habit.color }}
            >
              <Plus size={16} />
              Lisää
            </button>
            <button onClick={() => onIncrement(+1)} className={counterBtn} aria-label="Kasvata">
              <Plus size={20} />
            </button>
          </div>
        )}
      </div>

      {/* 7-day strip */}
      <div className="px-4 pb-2 pt-2">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
          Viimeiset 7 päivää
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <div
              key={d.date}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[10px] border"
              style={{
                borderColor: d.date === todayISO ? habit.color : 'rgba(255,255,255,0.07)',
                backgroundColor: d.reached ? `${habit.color}22` : 'rgba(255,255,255,0.03)',
              }}
            >
              <div className="font-mono text-[9px] uppercase text-white/40">{dayLetter(d.date)}</div>
              {d.reached ? (
                <Check size={14} color={habit.color} />
              ) : (
                <div className={`text-[11px] tabular-nums ${d.value > 0 ? 'text-text' : 'text-white/30'}`}>
                  {d.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
