import type { ComputedDay } from '../types'
import { toISO, fromISO, getWeekdayNum } from '../lib/dates'
import { s } from '../styles/tokens'

interface Props {
  days: ComputedDay[]
  selectedDate: string
  setSelectedDate: (d: string) => void
}

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
      <div style={s.weekHeader}>
        {['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((d) => (
          <div key={d} style={s.weekHeaderCell}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={s.weekRow}>
          {week.map((day, di) => {
            if (!day) return <div key={di} style={s.dayCell} />
            const isSelected = day.date === selectedDate
            const isToday = day.date === todayISO
            const hasEvent = !!day.event
            const hasExtra = day.extraKcal > 0
            const hasBuffer = day.preBufferReduction > 0
            return (
              <button
                key={di}
                onClick={() => setSelectedDate(day.date)}
                style={{
                  ...s.dayCell,
                  ...s.dayCellBtn,
                  ...(isSelected ? s.dayCellSelected : {}),
                  ...(isToday && !isSelected ? s.dayCellToday : {}),
                }}
              >
                <div style={s.dayNum}>{fromISO(day.date).getDate()}</div>
                <div style={s.dayDots}>
                  {hasEvent && (
                    <span style={{ ...s.dot, backgroundColor: '#e87a6a' }} />
                  )}
                  {hasExtra && (
                    <span style={{ ...s.dot, backgroundColor: '#6a9ad4' }} />
                  )}
                  {hasBuffer && !hasEvent && (
                    <span style={{ ...s.dot, backgroundColor: '#d4b85a' }} />
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
