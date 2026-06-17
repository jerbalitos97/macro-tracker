import type { ComputedDay } from '../types'
import { toISO, fromISO, getWeekdayNum } from '../lib/dates'

interface Props {
  days: ComputedDay[]
  selectedDate: string
  setSelectedDate: (d: string) => void
}

const dayCellBase =
  'relative flex aspect-square flex-col items-center justify-center rounded-lg border tabular-nums transition-colors'

export function CalendarGrid({ days, selectedDate, setSelectedDate }: Props) {
  const todayISO = toISO(new Date())
  const weeks: (ComputedDay | null)[][] = []
  let current: (ComputedDay | null)[] = []
  const firstDay = days[0]
  if (!firstDay) return null

  // Pad to Monday start (mon=0 offset)
  const firstDow = getWeekdayNum(firstDay.date)
  const mondayOffset = (firstDow + 6) % 7
  for (let i = 0; i < mondayOffset; i++) current.push(null)

  days.forEach((d) => {
    current.push(d)
    const dow = (getWeekdayNum(d.date) + 6) % 7
    if (dow === 6) {
      weeks.push(current)
      current = []
    }
  })
  if (current.length > 0) {
    while (current.length < 7) current.push(null)
    weeks.push(current)
  }

  return (
    <div>
      <div className="mb-[3px] grid grid-cols-7 gap-0.5">
        {['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((d) => (
          <div key={d} className="py-1 text-center text-[9px] uppercase tracking-[0.1em] text-[#444]">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="mb-0.5 grid grid-cols-7 gap-0.5">
          {week.map((day, di) => {
            if (!day) return <div key={di} className="aspect-square rounded-lg border border-transparent" />
            const isSelected = day.date === selectedDate
            const isToday = day.date === todayISO
            const hasEvent = day.events.length > 0
            const hasExtra = day.extraKcal > 0
            const hasBuffer = day.preBufferReduction > 0
            const stateCls = isSelected
              ? 'border-accent/60 bg-accent/[0.08] text-accent'
              : isToday
                ? 'border-white/[0.05] bg-[#0f0f0f] font-bold text-text'
                : 'border-white/[0.05] bg-[#0f0f0f] text-[#777]'
            return (
              <button
                key={di}
                onClick={() => setSelectedDate(day.date)}
                className={`${dayCellBase} ${stateCls}`}
              >
                <div className="text-xs leading-none">{fromISO(day.date).getDate()}</div>
                <div className="mt-[3px] flex h-1 items-center gap-0.5">
                  {hasEvent && (
                    <span className="inline-block h-[3px] w-[3px] rounded-full bg-danger" />
                  )}
                  {hasExtra && (
                    <span className="inline-block h-[3px] w-[3px] rounded-full bg-protein" />
                  )}
                  {hasBuffer && !hasEvent && (
                    <span className="inline-block h-[3px] w-[3px] rounded-full bg-accent" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
