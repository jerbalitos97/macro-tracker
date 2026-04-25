export const toISO = (d: Date): string => d.toISOString().split('T')[0]

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
