// Weekend water weight.
//
// Eating differently on Saturday and Sunday puts 1–1.5 kg on the scale that is
// gone again by Tuesday. It is real data — it says something about what the
// weekend did — but it is not fat, and the question is whether it should be
// allowed to move the trend.
//
// It should, and it already does, correctly. The 7-day moving average always
// spans exactly one Saturday and one Sunday, so every point on the trend line
// carries the same one weekend's worth of water. It is present in all of them
// equally, which means it cancels out of any *comparison* between two trend
// points — and the weekly rate is exactly such a comparison. Dropping weekend
// weigh-ins would do real damage: the average would then be built only from
// the lightest days of the week, sitting ~0.3–0.5 kg below the truth, and the
// day a weekend reading did slip through the level would jump for no reason.
//
// So: keep logging every morning, keep every reading in the average, and stop
// reading a single high Sunday as a setback. What this module adds is the
// missing piece — measuring the swing instead of ignoring it, so it can be
// named on screen ("lauantai +0,9 kg, palautuu 2 päivässä") rather than
// quietly alarming.

import type { WeightEntry, WeightTrend } from '../types'
import { daysBetween, getWeekdayNum } from './dates'

/** A reading this far above its own 7-day average counts as a swing, not a gain. */
const SPIKE_KG = 0.4
/** A swing has receded once it drops back under this share of its peak. */
const RECOVERED_FRACTION = 0.5
const MIN_ENTRIES = 14

export const DOW_SHORT = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']

export interface DowDeviation {
  dow: number
  label: string
  /** Mean kg above (+) or below (−) the trend line on this weekday. */
  meanDeviation: number
  samples: number
}

export interface BloatAnalysis {
  ready: boolean
  /** Why it is not ready yet, when it is not. */
  message?: string
  byDow: DowDeviation[]
  /** The weekday that sits highest above trend. */
  peak: DowDeviation | null
  /** The weekday that sits lowest — where the true reading is cleanest. */
  trough: DowDeviation | null
  /** Peak minus trough: the size of the weekly swing in kg. */
  swingKg: number
  /** Mean days for a spike to fall back under half its size. */
  recoveryDays: number | null
  /** Dates whose reading was a swing rather than a change in level. */
  spikeDates: Set<string>
  /** The same weekly rate computed from weekdays only — a cross-check that the
   *  swing is not what is driving the headline number. Null when there is not
   *  enough weekday history. */
  weekdayOnlyWeeklyChange: number | null
}

const empty = (message: string): BloatAnalysis => ({
  ready: false,
  message,
  byDow: [],
  peak: null,
  trough: null,
  swingKg: 0,
  recoveryDays: null,
  spikeDates: new Set(),
  weekdayOnlyWeeklyChange: null,
})

/** Weekly rate from weekday readings only. Same shape as the headline rate:
 *  the change between a point ~14 days back and now, scaled to kg/week. Its
 *  *level* is biased low (weekdays are the light days) but the *change*
 *  between two weekday-only points is not, which is the point of it here. */
function weekdayOnlyRate(entries: WeightEntry[]): number | null {
  const weekdays = entries.filter((w) => {
    const d = getWeekdayNum(w.date)
    return d !== 0 && d !== 6
  })
  if (weekdays.length < 8) return null
  const smooth = (slice: WeightEntry[]) => slice.reduce((s, w) => s + w.kg, 0) / slice.length
  // Five weekday readings ≈ one working week, so each end is a full week's mean.
  const recent = weekdays.slice(-5)
  const earlier = weekdays.slice(-10, -5)
  if (earlier.length < 5) return null
  const span = daysBetween(earlier[Math.floor(earlier.length / 2)].date, recent[Math.floor(recent.length / 2)].date)
  if (span < 3) return null
  return ((smooth(recent) - smooth(earlier)) / span) * 7
}

export function analyzeBloat(weights: WeightEntry[], trend: WeightTrend): BloatAnalysis {
  const entries = weights
    .filter((w) => !w.excludeFromTrend && w.kg)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (entries.length < MIN_ENTRIES) {
    return empty(`Tarvitaan ${MIN_ENTRIES - entries.length} pv lisää kirjauksia ennen kuin viikkorytmi voidaan mitata.`)
  }

  const trendByDate = new Map(trend.trendData.map((t) => [t.date, t.trend]))

  // Deviation of each raw reading from its own smoothed value.
  const deviations: Array<{ date: string; dow: number; dev: number }> = []
  for (const w of entries) {
    const t = trendByDate.get(w.date)
    if (t === undefined) continue
    deviations.push({ date: w.date, dow: getWeekdayNum(w.date), dev: w.kg - t })
  }
  if (deviations.length < MIN_ENTRIES) {
    return empty('Trendi ei kata vielä tarpeeksi kirjauksia viikkorytmin mittaamiseen.')
  }

  const byDow: DowDeviation[] = []
  for (let dow = 0; dow < 7; dow++) {
    const rows = deviations.filter((d) => d.dow === dow)
    if (rows.length === 0) continue
    byDow.push({
      dow,
      label: DOW_SHORT[dow],
      meanDeviation: rows.reduce((s, r) => s + r.dev, 0) / rows.length,
      samples: rows.length,
    })
  }
  if (byDow.length < 5) {
    return empty('Kirjauksia puuttuu liian monelta viikonpäivältä.')
  }

  const peak = byDow.reduce((a, b) => (a.meanDeviation >= b.meanDeviation ? a : b))
  const trough = byDow.reduce((a, b) => (a.meanDeviation <= b.meanDeviation ? a : b))

  // How long a spike takes to recede: from each spike day, count forward to the
  // first reading back under half the spike.
  const spikeDates = new Set<string>()
  const recoveries: number[] = []
  for (let i = 0; i < deviations.length; i++) {
    const d = deviations[i]
    if (d.dev < SPIKE_KG) continue
    spikeDates.add(d.date)
    for (let j = i + 1; j < deviations.length; j++) {
      if (deviations[j].dev <= d.dev * RECOVERED_FRACTION) {
        recoveries.push(daysBetween(d.date, deviations[j].date))
        break
      }
    }
  }

  return {
    ready: true,
    byDow,
    peak,
    trough,
    swingKg: peak.meanDeviation - trough.meanDeviation,
    recoveryDays: recoveries.length > 0 ? recoveries.reduce((s, n) => s + n, 0) / recoveries.length : null,
    spikeDates,
    weekdayOnlyWeeklyChange: weekdayOnlyRate(entries),
  }
}
