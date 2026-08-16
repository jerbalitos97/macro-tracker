// Rolling a difference forward onto future days.
//
// Two places need this: the analysis screen's "tasoitus" suggestion (close a
// cumulative gap) and a past day in the calendar that came in over or under
// its plan (settle that one day). Both end up doing the same thing — spread a
// signed number of kcal across the next N days as daily adjustments — so both
// go through here.
//
// Whether a source day has been settled is not stored separately. The
// adjustments carry a tag naming the day they came from, so "is this day
// compensated" is answered by looking at the adjustments themselves. That
// keeps it correct across devices for free: the adjustments already sync, and
// deleting them un-marks the day, which is what a user deleting them means.

import type { DailyAdjustment } from '../types'
import { addDays } from './dates'

const TAG_PREFIX = 'komp:'

export function compensationTag(sourceDate: string): string {
  return `${TAG_PREFIX}${sourceDate}`
}

/** Adjustments created to settle the given day. */
export function compensationsFor(
  adjustments: DailyAdjustment[],
  sourceDate: string,
): DailyAdjustment[] {
  const tag = compensationTag(sourceDate)
  return adjustments.filter((a) => (a.note ?? '').includes(tag))
}

/** Signed kcal already rolled forward from this day. */
export function compensatedKcal(adjustments: DailyAdjustment[], sourceDate: string): number {
  return compensationsFor(adjustments, sourceDate).reduce((s, a) => s + Number(a.kcal), 0)
}

export function isCompensated(adjustments: DailyAdjustment[], sourceDate: string): boolean {
  return compensationsFor(adjustments, sourceDate).length > 0
}

/** Notes are shown to the user; the tag is plumbing. */
export function stripTags(note: string | undefined): string {
  if (!note) return ''
  return note
    .split(' · ')
    .filter((part) => !part.startsWith(TAG_PREFIX))
    .join(' · ')
}

export interface RolloutDay {
  date: string
  kcal: number
}

/** Spread `totalKcal` across `days` days starting the day after `fromDate`,
 *  stopping at `lastDate`. The sign of totalKcal carries through: negative
 *  tightens the budget (more deficit), positive loosens it.
 *
 *  The rounding puts the remainder on the first day rather than letting it
 *  vanish — spreading 250 over 3 days has to still add up to 250. */
export function planRollout(
  totalKcal: number,
  days: number,
  fromDate: string,
  lastDate: string,
): RolloutDay[] {
  const out: RolloutDay[] = []
  for (let i = 1; i <= days; i++) {
    const date = addDays(fromDate, i)
    if (date > lastDate) break
    out.push({ date, kcal: 0 })
  }
  if (out.length === 0) return out

  const per = Math.trunc(totalKcal / out.length)
  let assigned = per * out.length
  out.forEach((d) => { d.kcal = per })
  const remainder = Math.round(totalKcal - assigned)
  out[0].kcal += remainder
  assigned += remainder
  return out.filter((d) => d.kcal !== 0)
}

/** How far a day's result landed from what its plan asked. Positive means the
 *  day beat its plan (room to loosen later), negative means it fell short
 *  (needs making up). Null when nothing was logged — a gap, not a zero. */
export function dayDelta(day: {
  consumed: number
  burnKcal: number
  actualDeficit?: number | null
  dailyDeficitBase: number
}): number | null {
  if (day.consumed <= 0 && day.burnKcal <= 0) return null
  return Math.round((day.actualDeficit ?? 0) - day.dailyDeficitBase)
}
