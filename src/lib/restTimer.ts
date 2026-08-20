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

export const REST_TARGETS = [60, 90, 120, 180] as const

/** Two things get clocked mid-session and they are not the same thing. A rest
 *  has a target you are waiting to pass; a hold has no target at all — you are
 *  measuring how long you lasted, and any number the app suggested would be a
 *  number to quit at. So a hold is the same stopwatch with targetSec 0, and
 *  nothing is drawn as "past". */
export type ClockKind = 'rest' | 'hold'

export interface ActiveRest {
  /** Epoch ms. */
  startedAt: number
  /** Seconds the rest is aiming for; the timer keeps running past it. 0 for a
   *  hold, which has no target. */
  targetSec: number
  /** Defaults to 'rest' on entries written before holds existed. */
  kind?: ClockKind
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
  kind?: ClockKind
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

export function startRest(targetSec: number, workoutId?: string, kind: ClockKind = 'rest'): ActiveRest {
  const a: ActiveRest = { startedAt: Date.now(), targetSec, kind, workoutId }
  write(K_ACTIVE, a)
  return a
}

/** An open-ended hold. No target, so nothing to be late for. */
export function startHold(workoutId?: string): ActiveRest {
  return startRest(0, workoutId, 'hold')
}

export function isHold(a: ActiveRest): boolean {
  return a.kind === 'hold' || a.targetSec === 0
}

/** How long the rest alarm keeps sounding once the target is reached. It
 *  repeats rather than chiming once because the phone is face-down on the
 *  floor and you are not looking at it — one beep is easy to miss, and the
 *  timer deliberately keeps running past the target, so nothing is lost by
 *  hearing it late. */
export const ALARM_SEC = 10

/** Is the alarm sounding at this many seconds in?
 *
 *  A hold has no target, so it never alarms — the whole point of a hold is that
 *  there is no number to reach. And the window closes: reopening the app twenty
 *  minutes after a forgotten rest should be quiet, not an alarm for a moment
 *  that passed long ago. */
export function inAlarmWindow(a: ActiveRest, seconds: number): boolean {
  if (isHold(a)) return false
  return seconds >= a.targetSec && seconds < a.targetSec + ALARM_SEC
}

/** Seconds per colour step on the hold clock. */
export const HOLD_STEP_SEC = 5

/** Which colour step a hold is in. The digits are readable but they ask you to
 *  read; a colour change lands in peripheral vision while you are upside down
 *  in the hold, which is the only place attention is available. */
export function holdStep(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / HOLD_STEP_SEC)
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
  // A hold of a few seconds is a real hold; a rest of a few seconds is a
  // mis-tap, so only rests have a floor.
  if (seconds < (isHold(a) ? 2 : 5)) return null
  const entry: RestEntry = {
    id: `${a.startedAt}`,
    date: toISO(new Date(a.startedAt)),
    startedAt: a.startedAt,
    endedAt,
    seconds,
    targetSec: a.targetSec,
    kind: a.kind ?? 'rest',
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
