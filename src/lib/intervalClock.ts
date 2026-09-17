// The mobility interval clock, as derived state rather than a running timer.
//
// The old engine was a chain of setTimeouts held in component state, which
// meant the clock existed only while its sheet was mounted and the tab was
// awake. Closing the sheet killed it; switching apps froze it and it came back
// wrong. Both are the normal way this gets used — you put the phone down and
// get into the position.
//
// So nothing counts. The run stores the instant it began and every question is
// answered from the wall clock: phase, round, seconds left. Close the sheet,
// lock the phone, come back two minutes later and the answer is right, because
// there was never a timer to lose.
//
// One thing stays manual: with perSide, side 2 does not start itself. The
// switch is a real pause in the room — you have to change legs — so it waits
// for a tap rather than silently running out the clock on a leg still resting.

import type { IntervalConfig } from './workouts'

const K_RUN = 'mimir.workouts.intervalRun:v1'

/** Lead-in before the first contraction. */
export const COUNTDOWN_SEC = 3

/** A run that has been going this long is a phone left on a bench overnight,
 *  not a set. Discarded on read rather than resumed. */
const ABANDONED_AFTER_SEC = 2 * 60 * 60

export interface IntervalRun {
  /** The logged exercise this belongs to, so a stale run never attaches to the
   *  wrong movement after the app reopens somewhere else. */
  exerciseId: string
  workoutId?: string
  setIndex: number
  side: 1 | 2
  /** Epoch ms. Shifted forward when a pause is released, so elapsed time stays
   *  a plain subtraction and never needs a separate accumulator. */
  startedAt: number
  /** Epoch ms of the pause, when paused. */
  pausedAt?: number
  config: IntervalConfig
}

export type Phase = 'countdown' | 'work' | 'rest' | 'done'

export interface RunState {
  phase: Phase
  round: number
  /** Whole seconds remaining in this phase; 0 once done. */
  secondsLeft: number
  elapsed: number
}

/** Rest between rounds is optional; below a second it is not a phase at all. */
function restOf(c: IntervalConfig): number {
  return c.restSeconds >= 1 ? c.restSeconds : 0
}

/** How long one side takes end to end, including the lead-in. */
export function sideDurationSec(c: IntervalConfig): number {
  const rounds = Math.max(1, c.rounds)
  return COUNTDOWN_SEC + rounds * c.workSeconds + (rounds - 1) * restOf(c)
}

/** Where a side stands after `elapsed` seconds. Pure — this is the whole
 *  engine, and it is why the clock survives anything. */
export function phaseAt(c: IntervalConfig, elapsed: number): RunState {
  const rounds = Math.max(1, c.rounds)
  const rest = restOf(c)
  let t = Math.max(0, elapsed)

  if (t < COUNTDOWN_SEC) {
    return { phase: 'countdown', round: 1, secondsLeft: Math.ceil(COUNTDOWN_SEC - t), elapsed }
  }
  t -= COUNTDOWN_SEC

  for (let r = 1; r <= rounds; r++) {
    if (t < c.workSeconds) {
      return { phase: 'work', round: r, secondsLeft: Math.ceil(c.workSeconds - t), elapsed }
    }
    t -= c.workSeconds
    if (r === rounds) break
    if (rest > 0) {
      if (t < rest) return { phase: 'rest', round: r, secondsLeft: Math.ceil(rest - t), elapsed }
      t -= rest
    }
  }
  return { phase: 'done', round: rounds, secondsLeft: 0, elapsed }
}

export function elapsedOf(run: IntervalRun, now: number = Date.now()): number {
  const end = run.pausedAt ?? now
  return Math.max(0, (end - run.startedAt) / 1000)
}

export function stateOf(run: IntervalRun, now?: number): RunState {
  return phaseAt(run.config, elapsedOf(run, now))
}

// ── Persistence ────────────────────────────────────────────────────────────

function read(): IntervalRun | null {
  try {
    const raw = localStorage.getItem(K_RUN)
    return raw ? (JSON.parse(raw) as IntervalRun) : null
  } catch {
    return null
  }
}

export function getRun(): IntervalRun | null {
  const r = read()
  if (!r || typeof r.startedAt !== 'number' || !r.config) return null
  if (elapsedOf(r) > ABANDONED_AFTER_SEC) {
    clearRun()
    return null
  }
  return r
}

/** The run for one exercise, or null when the stored run belongs elsewhere. */
export function runFor(exerciseId: string): IntervalRun | null {
  const r = getRun()
  return r && r.exerciseId === exerciseId ? r : null
}

export function saveRun(run: IntervalRun): IntervalRun {
  try {
    localStorage.setItem(K_RUN, JSON.stringify(run))
  } catch {
    // best-effort; a full quota must not break the clock
  }
  return run
}

export function clearRun(): void {
  try {
    localStorage.removeItem(K_RUN)
  } catch {
    // ignore
  }
}

export function startRun(
  exerciseId: string,
  setIndex: number,
  config: IntervalConfig,
  side: 1 | 2 = 1,
  workoutId?: string,
): IntervalRun {
  return saveRun({ exerciseId, workoutId, setIndex, side, startedAt: Date.now(), config })
}

export function pauseRun(run: IntervalRun): IntervalRun {
  if (run.pausedAt) return run
  return saveRun({ ...run, pausedAt: Date.now() })
}

/** Resuming shifts the start forward by however long the pause lasted, which
 *  keeps elapsed time a subtraction and the phase a pure function of it. */
export function resumeRun(run: IntervalRun): IntervalRun {
  if (!run.pausedAt) return run
  const paused = Date.now() - run.pausedAt
  const { pausedAt: _dropped, ...rest } = run
  return saveRun({ ...rest, startedAt: run.startedAt + paused })
}

/** Total contraction time for a completed set, for the log. */
export function contractionSeconds(c: IntervalConfig): number {
  return c.workSeconds * Math.max(1, c.rounds) * (c.perSide ? 2 : 1)
}
