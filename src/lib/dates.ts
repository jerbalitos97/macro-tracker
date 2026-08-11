// The LOCAL calendar date, not the UTC one. toISOString() converts to UTC
// first, so in any positive-offset zone (Finland is UTC+2/+3) a Date built at
// local midnight — `new Date(y, m, d)` — lands on the previous day, and
// `new Date()` does the same between midnight and the offset. That shifted the
// whole workout calendar a weekday off and would file an entry logged at 01:00
// under yesterday.
export const toISO = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const fromISO = (s: string): Date => new Date(s + 'T12:00:00')

export const addDays = (dateISO: string, n: number): string => {
  const d = fromISO(dateISO)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const daysBetween = (aISO: string, bISO: string): number => {
  const a = fromISO(aISO)
  const b = fromISO(bISO)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export const formatDateShort = (iso: string): string => {
  const d = fromISO(iso)
  return d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

export const formatDayOfWeek = (iso: string): string => {
  const d = fromISO(iso)
  return d.toLocaleDateString('fi-FI', { weekday: 'long' })
}

// 0 = su, 1 = ma, …, 6 = la
export const getWeekdayNum = (iso: string): number => fromISO(iso).getDay()
