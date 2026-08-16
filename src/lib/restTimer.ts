// Rest timer.
//
// A web app gets no CPU when it is closed, so a timer implemented as an
// interval simply stops. This one stores the instant it started instead and
// derives the elapsed time from the clock whenever anyone looks. Close the
// app, lock the phone, come back four minutes later — the number is right,
// because nothing was ever counting.
//
// It counts up rather than down, with the chosen rest only marking a line on
// the way past. The rest ends when you say it ends; the target is information,
// not a buzzer, which also means nothing is lost when the app was closed at
// the moment the target passed.

import { toISO } from './dates'

const K_ACTIVE = 'mimir.workouts.restTimer:v1'
const K_LOG = 'mimir.workouts.restLog:v1'

/** Rests longer than this are almost certainly a timer left running overnight
 *  rather than a rest, and are discarded on read rather than recorded. */
const ABANDONED_AFTER_SEC = 2 * 60 * 60

export const REST_TARGETS = [60, 90, 120, 180, 300] as const

export interface ActiveRest {
  /** Epoch ms. */
  startedAt: number
  /** Seconds the rest is aiming for; the timer keeps running past it. */
  targetSec: number
  /** The session it belongs to, when started from inside one. */
  workoutId?: string
}

export interface RestEntry {
  id: string
  date: string
  startedAt: number
  endedAt: number
  seconds: number
  targetSec: number
  workoutId?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // best-effort; a full quota must not break the timer
  }
}

export function getActiveRest(): ActiveRest | null {
  const a = read<ActiveRest | null>(K_ACTIVE, null)
  if (!a || typeof a.startedAt !== 'number') return null
  if (elapsedSec(a) > ABANDONED_AFTER_SEC) {
    clearActiveRest()
    return null
  }
  return a
}

export function elapsedSec(a: ActiveRest, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - a.startedAt) / 1000))
}

export function startRest(targetSec: number, workoutId?: string): ActiveRest {
  const a: ActiveRest = { startedAt: Date.now(), targetSec, workoutId }
  write(K_ACTIVE, a)
  return a
}

export function clearActiveRest(): void {
  try {
    localStorage.removeItem(K_ACTIVE)
  } catch {
    // ignore
  }
}

/** End the running rest and record it. Returns the entry, or null when there
 *  was nothing running or it was too short to be a rest. */
export function endRest(): RestEntry | null {
  const a = getActiveRest()
  clearActiveRest()
  if (!a) return null
  const endedAt = Date.now()
  const seconds = Math.max(0, Math.round((endedAt - a.startedAt) / 1000))
  if (seconds < 5) return null
  const entry: RestEntry = {
    id: `${a.startedAt}`,
    date: toISO(new Date(a.startedAt)),
    startedAt: a.startedAt,
    endedAt,
    seconds,
    targetSec: a.targetSec,
    workoutId: a.workoutId,
  }
  write(K_LOG, [...getRestLog(), entry].slice(-500))
  return entry
}

export function getRestLog(): RestEntry[] {
  const list = read<RestEntry[]>(K_LOG, [])
  return Array.isArray(list) ? list : []
}

export function restsOn(dateISO: string): RestEntry[] {
  return getRestLog().filter((r) => r.date === dateISO)
}

export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
