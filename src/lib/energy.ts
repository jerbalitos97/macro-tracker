// Estimating what a logged session actually cost.
//
// Two things make a naive estimate wrong, and both push it too high.
//
// The first is the generic MET convention, where 1 MET is 3.5 ml O₂/kg/min —
// roughly "1 kcal per kg per hour". That constant was derived from a 40-year-old
// 70 kg reference man and overstates resting metabolism for most people, so
// every multiple built on it inherits the error. Using the person's own
// estimated resting rate (Mifflin–St Jeor, which is where height and age earn
// their keep) instead of the constant removes it.
//
// The second is double counting. The app's TDEE is set per day type — rest,
// one session, two sessions, volleyball — so a training day's TDEE *already*
// contains an allowance for training. Adding a session's full burn on top of
// that counts the same workout twice. So the number offered for logging is the
// amount by which the session exceeded what the day already assumed, never the
// raw figure.
//
// Everything here is then deliberately biased low: METs taken from the bottom
// of their published ranges, a slow assumed tempo, only sets actually checked
// off counted, and a final 15% haircut. Undershooting costs a few kcal of
// unclaimed budget; overshooting silently eats the deficit the whole plan is
// built on.

import type { DayType, Settings, TrainingBurn } from '../types'
import type { Workout, LoggedExercise, SetEntry } from './workouts'
import { getWeekdayNum } from './dates'

/** Deliberate underestimate applied at the end. */
const PESSIMISM = 0.85

// Published METs cover a *whole* session, rest periods included — the
// Compendium's "resistance training, multiple exercises, 8–15 reps" is 5.0 for
// the hour you spent lifting, not for the eight minutes the bar was moving.
// Applying a high MET only to the working sets and a near-resting one to the
// gaps therefore discounts twice and lands absurdly low. So each kind of work
// gets one MET applied to its whole elapsed time, chosen at the pessimistic
// end of the published range.
const MET_STRENGTH = 3.8   // between "light/moderate, general" 3.5 and "multiple exercises" 5.0
const MET_TIMED = 2.5      // mobility, holds, stretching
const MET_INTERVAL = 5.0   // clocked circuit work

/** Seconds of movement per rep. Slow enough to be conservative. */
const SECONDS_PER_REP = 3
const MIN_SET_SECONDS = 20
/** Rest counted after each working set — part of the session's elapsed time. */
const REST_SECONDS_PER_SET = 75
/** Nobody's logged session is worth more than this; guards against a typo in
 *  a rep count turning into a four-figure burn. */
const MAX_SESSION_MINUTES = 150

export interface BodyMetrics {
  weightKg: number
  heightCm?: number
  age?: number
  sex?: 'male' | 'female'
}

/** Resting kcal per minute, Mifflin–St Jeor. Falls back to the generic
 *  1 kcal/kg/h convention when height or age are unknown — less accurate, and
 *  the UI says so rather than pretending otherwise. */
export function restingKcalPerMin(b: BodyMetrics): number {
  if (!b.heightCm || !b.age) return b.weightKg / 60
  // Sex shifts the constant by ±83 kcal/day. With it unset, sit in the middle
  // rather than assuming, and accept the wider error.
  const constant = b.sex === 'male' ? 5 : b.sex === 'female' ? -161 : -78
  const perDay = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + constant
  return Math.max(0.5, perDay / 1440)
}

export function hasFullMetrics(b: BodyMetrics): boolean {
  return Boolean(b.heightCm && b.age)
}

/** Net kcal above rest for `minutes` at `met`. Net, not gross: the resting
 *  share of those minutes is already inside TDEE. */
function netKcal(met: number, minutes: number, rmrPerMin: number): number {
  return Math.max(0, met - 1) * rmrPerMin * minutes
}

function setSeconds(s: SetEntry): { work: number; timed: boolean } {
  if (s.duration != null && s.duration > 0) return { work: s.duration, timed: true }
  const reps = s.reps ?? 0
  return { work: Math.max(MIN_SET_SECONDS, reps * SECONDS_PER_REP), timed: false }
}

export interface SessionEstimate {
  /** Net kcal above rest, after the pessimism haircut. */
  kcal: number
  /** Elapsed minutes the estimate is built from, counted rest included. */
  workMinutes: number
  /** Sets that were actually checked off. Unchecked sets are not counted —
   *  a plan is not a performance. */
  countedSets: number
  /** True when height and age were available, so RMR is the person's own. */
  precise: boolean
}

/** What one logged session cost, net of resting metabolism. Only sets marked
 *  done are counted. */
export function estimateSession(workout: Workout, body: BodyMetrics): SessionEstimate {
  const rmr = restingKcalPerMin(body)
  // Elapsed seconds by kind of work, each carrying its own MET.
  let strengthSec = 0
  let timedSec = 0
  let intervalSec = 0
  let countedSets = 0

  for (const ex of workout.exercises) {
    const interval = (ex as LoggedExercise).interval
    for (const s of ex.sets) {
      if (s.done !== true) continue
      countedSets++
      const { work, timed } = setSeconds(s)
      if (interval) intervalSec += work
      else if (timed) timedSec += work
      // A loaded set owns its rest: that time is part of the session.
      else strengthSec += work + REST_SECONDS_PER_SET
    }
  }

  const totalSec = strengthSec + timedSec + intervalSec
  // Scale everything down together if the total is implausible, so the mix
  // between kinds of work is preserved.
  const scale = totalSec > MAX_SESSION_MINUTES * 60 ? (MAX_SESSION_MINUTES * 60) / totalSec : 1

  const kcal =
    netKcal(MET_STRENGTH, (strengthSec * scale) / 60, rmr) +
    netKcal(MET_TIMED, (timedSec * scale) / 60, rmr) +
    netKcal(MET_INTERVAL, (intervalSec * scale) / 60, rmr)

  return {
    kcal: Math.floor(kcal * PESSIMISM),
    workMinutes: Math.round((totalSec * scale) / 60),
    countedSets,
    precise: hasFullMetrics(body),
  }
}

/** kcal the day type already assumes for training, over and above a rest day.
 *  This is the amount that must not be counted a second time. */
export function assumedTrainingKcal(settings: Settings, dayType: DayType): number {
  return Math.max(0, (settings.tdee[dayType] ?? 0) - (settings.tdee.rest ?? 0))
}

export function dayTypeFor(settings: Settings, dateISO: string): DayType {
  return settings.weeklyPattern[getWeekdayNum(dateISO)] ?? 'rest'
}

export interface LoggableBurn {
  /** This session's own estimate. */
  sessionKcal: number
  /** Every session estimated for the day, this one included. */
  dayTotalKcal: number
  /** What the day type already covers. */
  assumedKcal: number
  /** Burns already recorded for the day. */
  alreadyLoggedKcal: number
  /** What is left to record — never negative. */
  loggableKcal: number
  precise: boolean
  workMinutes: number
  countedSets: number
}

/** Turn a session estimate into the number that may actually be recorded,
 *  after removing what the day type already assumes and what has already been
 *  logged for that date. */
export function computeLoggableBurn(args: {
  workout: Workout
  sameDayWorkouts: Workout[]
  settings: Settings
  burns: TrainingBurn[]
  body: BodyMetrics
}): LoggableBurn {
  const { workout, sameDayWorkouts, settings, burns, body } = args
  const own = estimateSession(workout, body)

  const others = sameDayWorkouts.filter((w) => w.id !== workout.id && w.completed)
  const dayTotal =
    own.kcal + others.reduce((sum, w) => sum + estimateSession(w, body).kcal, 0)

  const assumed = assumedTrainingKcal(settings, dayTypeFor(settings, workout.date))
  const alreadyLogged = burns
    .filter((b) => b.date === workout.date)
    .reduce((sum, b) => sum + Number(b.kcal), 0)

  return {
    sessionKcal: own.kcal,
    dayTotalKcal: dayTotal,
    assumedKcal: assumed,
    alreadyLoggedKcal: alreadyLogged,
    loggableKcal: Math.max(0, Math.round(dayTotal - assumed - alreadyLogged)),
    precise: own.precise,
    workMinutes: own.workMinutes,
    countedSets: own.countedSets,
  }
}
