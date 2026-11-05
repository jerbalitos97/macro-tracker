import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Meal } from '../types'
import { Card } from '../components/ui'
import { MealRow } from '../components/MealRow'
import { toISO } from '../lib/dates'

// Kalenteri kirjaustilaan: päivän kalorit kuukausiruudukossa ja valitun päivän
// ateriat. Ei budjettia eikä jaksoa — ks. TodayView LogOnlyToday.

const WEEKDAYS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']

export function LogCalendarView({
  meals, onDeleteMeal,
}: { meals: Meal[]; onDeleteMeal: (id: number) => void }) {
  const today = toISO(new Date())
  const [month, setMonth] = useState(() => today.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState(today)

  const kcalByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const meal of meals) m.set(meal.date, (m.get(meal.date) ?? 0) + Number(meal.kcal))
    return m
  }, [meals])

  const cells = useMemo(() => {
    const [y, mo] = month.split('-').map(Number)
    const first = new Date(y, mo - 1, 1)
    const lead = (first.getDay() + 6) % 7 // maanantai ensin
    const count = new Date(y, mo, 0).getDate()
    const out: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= count; d++) out.push(`${month}-${String(d).padStart(2, '0')}`)
    return out
  }, [month])

  const shift = (delta: number) => {
    const [y, mo] = month.split('-').map(Number)
    const d = new Date(y, mo - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })
  const dayMeals = meals.filter((m) => m.date === selected)
  const dayTotal = kcalByDay.get(selected) ?? 0

  return (
    <div className="px-4 pb-2 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <button aria-label="Edellinen kuukausi" onClick={() => shift(-1)} className="cursor-pointer p-2 text-fg-muted">
          <ChevronLeft size={18} />
        </button>
        <div className="font-display text-[18px] font-bold capitalize text-text">{monthLabel}</div>
        <button aria-label="Seuraava kuukausi" onClick={() => shift(1)} className="cursor-pointer p-2 text-fg-muted">
          <ChevronRight size={18} />
        </button>
      </div>

      <Card variant="glass">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-fg-ghost">{w}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} />
            const kcal = kcalByDay.get(date)
            const isSel = date === selected
            const isToday = date === today
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                aria-label={`${date}${kcal ? `, ${Math.round(kcal)} kcal` : ''}`}
                aria-pressed={isSel}
                className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-[12px] ${
                  isSel ? 'border-accent bg-accent/15 text-text' : isToday ? 'border-white/20 text-text' : 'border-transparent text-fg-muted'
                }`}
              >
                <span>{Number(date.slice(8))}</span>
                {kcal ? (
                  <span className="font-mono text-[8px] tabular-nums text-accent">{Math.round(kcal)}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="mt-[18px]">
        <div className="mb-2 flex items-baseline justify-between text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          <span>{new Date(`${selected}T12:00:00`).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' })}</span>
          <span className="tabular-nums">{Math.round(dayTotal).toLocaleString('fi-FI')} kcal</span>
        </div>
        {dayMeals.length === 0 ? (
          <div className="py-2.5 text-xs text-fg-ghost">Ei kirjauksia.</div>
        ) : (
          dayMeals.map((m) => <MealRow key={m.id} meal={m} onDelete={onDeleteMeal} />)
        )}
      </div>
    </div>
  )
}
