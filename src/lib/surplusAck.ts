// Tracks which past days the user has already seen the "extra deficit earned"
// popup for, so it doesn't reappear after dismissal. Local-only state —
// per-device, not synced to the cloud. The popup itself is purely a one-time
// nudge; the underlying deficit data is in the cumulative metric regardless.

const KEY = 'cutdata:surplus-ack:v1'

export function getAcknowledgedSurpluses(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function acknowledgeSurplus(date: string): void {
  try {
    const cur = getAcknowledgedSurpluses()
    cur.add(date)
    localStorage.setItem(KEY, JSON.stringify([...cur]))
  } catch {
    // ignore: tracking is best-effort
  }
}
