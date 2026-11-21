import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ComputedDay } from '../types'
import { toISO, fromISO, getWeekdayNum } from '../lib/dates'

interface Props {
  days: ComputedDay[]
  selectedDate: string
  setSelectedDate: (d: string) => void
}

const dayCellBase =
  'relative flex aspect-square flex-col items-center justify-center rounded-lg border tabular-nums transition-colors'

const navBtn =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-fg-faint disabled:cursor-default disabled:opacity-30'

export function CalendarGrid({ days: allDays, selectedDate, setSelectedDate }: Props) {
  const todayISO = toISO(new Date())
  // Kuukausi näytetään kerrallaan: koko tavoitejakso yhtenä ruudukkona on
  // pitkä eikä kerro, missä "nyt" on. Seuraa valittua päivää, jotta
  // edellinen/seuraava-nuolet päivänäkymässä vievät oikeaan kuukauteen.
  const [month, setMonth] = useState(selectedDate.slice(0, 7))
  useEffect(() => setMonth(selectedDate.slice(0, 7)), [selectedDate])

  // Selattavat kuukaudet rajautuvat jakson päiviin — niiden ulkopuolelta ei
  // ole laskettua dataa.
  const months = Array.from(new Set(allDays.map((d) => d.date.slice(0, 7))))
  const monthIdx = months.indexOf(month)
  const shown = monthIdx >= 0 ? month : months[0]
  const days = allDays.filter((d) => d.date.slice(0, 7) === shown)
  const weeks: (ComputedDay | null)[][] = []
  let current: (ComputedDay | null)[] = []
  const firstDay = days[0]
  if (!firstDay) return null
  const idx = months.indexOf(shown)
  const label = fromISO(firstDay.date).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })

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
      <div className="mb-1 flex items-center justify-between">
        <button type="button" className={navBtn} aria-label="Edellinen kuukausi"
          disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>
          <ChevronLeft size={18} />
        </button>
        <div className="text-[14px] font-medium capitalize text-text">{label}</div>
        <button type="button" className={navBtn} aria-label="Seuraava kuukausi"
          disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mb-[3px] grid grid-cols-7 gap-0.5">
        {['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((d) => (
          <div key={d} className="py-1 text-center text-[12px]   text-fg-ghost">{d}</div>
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
                : 'border-white/[0.05] bg-[#0f0f0f] text-fg-faint'
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
