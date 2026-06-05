// Interpret the latest weight trend in the context of a goal period's type
// (cut / maintenance / refill / bulk). The trick this module handles is
// distinguishing a *refill* (rise-then-plateau by design) from continuous
// overeating (rise that never plateaus).

import type { GoalPeriod, WeightTrend } from '../types'
import { addDays, daysBetween } from './dates'

export type TrendStatus =
  | 'on-track'
  | 'warn-overeat'
  | 'warn-underweight'
  | 'refill-safe'
  | 'refill-overshoot'
  | 'refill-not-plateauing'
  | 'no-data'

export interface TrendStatusResult {
  status: TrendStatus
  title: string
  body: string
  tone: 'ok' | 'warn' | 'danger' | 'info'
  /** Latest 7-MA trend value, copied from input for convenience. */
  currentTrend: number | null
  /** kg/week change (14-day slope), copied from input. */
  weeklyChange: number | null
}

// ── Plateau detection ─────────────────────────────────────────────────────
/**
 * Plateau over the last ~`days` calendar days: did the smoothed trend stop
 * moving meaningfully? Slope is computed from the trend points whose dates
 * fall within `today − days … today`. Threshold: |slope × 7| < 0.3 kg/wk.
 */
export function hasPlateaued(
  trend: WeightTrend,
  today: string,
  days: number = 7,
  thresholdKgPerWeek: number = 0.3,
): boolean {
  if (trend.trendData.length < 3) return false
  const cutoff = addDays(today, -days)
  const window = trend.trendData.filter((p) => p.date >= cutoff)
  if (window.length < 3) return false
  const first = window[0]
  const last = window[window.length - 1]
  const span = daysBetween(first.date, last.date)
  if (span < 2) return false
  const weeklySlope = ((last.trend - first.trend) / span) * 7
  return Math.abs(weeklySlope) < thresholdKgPerWeek
}

// ── Per-period interpretation ─────────────────────────────────────────────

interface Inputs {
  period: GoalPeriod
  trend: WeightTrend
  today: string
}

const fmt = (n: number, digits = 2) =>
  `${n > 0 ? '+' : ''}${n.toFixed(digits)}`

export function interpretTrend({ period, trend, today }: Inputs): TrendStatusResult {
  const { currentTrend, weeklyChange } = trend
  const base = { currentTrend, weeklyChange }

  if (currentTrend === null || weeklyChange === null) {
    return {
      ...base,
      status: 'no-data',
      tone: 'info',
      title: 'Ei tarpeeksi dataa',
      body: 'Kirjaa painoa muutamia päiviä lisää, niin tulkinta aktivoituu.',
    }
  }

  switch (period.type) {
    case 'cut':
      return interpretCut(period, weeklyChange, base)
    case 'maintenance':
      return interpretMaintenance(weeklyChange, base)
    case 'bulk':
      return interpretBulk(weeklyChange, base)
    case 'refill':
      return interpretRefill(period, trend, today, base)
  }
}

// ── cut ───────────────────────────────────────────────────────────────────
function interpretCut(
  period: GoalPeriod,
  weeklyChange: number,
  base: Pick<TrendStatusResult, 'currentTrend' | 'weeklyChange'>,
): TrendStatusResult {
  const targetWeeklyKg =
    ((period.startWeight - period.targetWeight) /
      Math.max(1, daysBetween(period.startDate, period.endDate) + 1)) *
    7
  // Want a *loss* of magnitude targetWeeklyKg (assumed positive).
  // weeklyChange < 0 = losing. The "expected" weeklyChange is −targetWeeklyKg.
  const expected = -Math.abs(targetWeeklyKg)
  const gap = weeklyChange - expected // positive => not losing fast enough
  if (gap > 0.2) {
    return {
      ...base,
      status: 'warn-underweight',
      tone: 'warn',
      title: 'Lasku liian hidasta',
      body: `Trendi ${fmt(weeklyChange)} kg/vk; tavoitetahti ${fmt(expected)} kg/vk. Tiukenna vajetta tai pidennä jaksoa.`,
    }
  }
  if (gap < -0.2) {
    return {
      ...base,
      status: 'warn-underweight',
      tone: 'warn',
      title: 'Lasku liian nopeaa',
      body: `Trendi ${fmt(weeklyChange)} kg/vk; tavoitetahti ${fmt(expected)} kg/vk. Harkitse vajeen löysäämistä.`,
    }
  }
  return {
    ...base,
    status: 'on-track',
    tone: 'ok',
    title: 'Cut etenee suunnitellusti',
    body: `Trendi ${fmt(weeklyChange)} kg/vk lähellä tavoitetahtia (${fmt(expected)}).`,
  }
}

// ── maintenance ───────────────────────────────────────────────────────────
function interpretMaintenance(
  weeklyChange: number,
  base: Pick<TrendStatusResult, 'currentTrend' | 'weeklyChange'>,
): TrendStatusResult {
  if (weeklyChange > 0.3) {
    return {
      ...base,
      status: 'warn-overeat',
      tone: 'warn',
      title: 'Näyttää alkavan ylisyönniltä',
      body: `Trendi ${fmt(weeklyChange)} kg/vk maintenance-jaksolla. Varoitusraja +0,3 kg/vk ylittyy — tarkista syömiset.`,
    }
  }
  if (weeklyChange < -0.3) {
    return {
      ...base,
      status: 'warn-underweight',
      tone: 'warn',
      title: 'Vahinkovaje',
      body: `Trendi ${fmt(weeklyChange)} kg/vk. Maintenance-jakson pitäisi pysyä ±0,2 kg/vk sisällä — syö hieman enemmän.`,
    }
  }
  if (Math.abs(weeklyChange) <= 0.2) {
    return {
      ...base,
      status: 'on-track',
      tone: 'ok',
      title: 'Maintenance tasapainossa',
      body: `Trendi ${fmt(weeklyChange)} kg/vk, paino pysyy linjassa.`,
    }
  }
  // 0.2 – 0.3 zone
  return {
    ...base,
    status: 'on-track',
    tone: 'info',
    title: 'Hienoinen liike',
    body: `Trendi ${fmt(weeklyChange)} kg/vk. Toleranssin sisällä mutta seuraa kehitystä.`,
  }
}

// ── bulk ──────────────────────────────────────────────────────────────────
function interpretBulk(
  weeklyChange: number,
  base: Pick<TrendStatusResult, 'currentTrend' | 'weeklyChange'>,
): TrendStatusResult {
  if (weeklyChange > 0.4) {
    return {
      ...base,
      status: 'warn-overeat',
      tone: 'warn',
      title: 'Nousu liian nopeaa',
      body: `Trendi ${fmt(weeklyChange)} kg/vk. Bulk-jakso pitäisi nousta noin +0,2 kg/vk; >0,4 viittaa liikaan rasvankertymiseen.`,
    }
  }
  if (weeklyChange < 0.05) {
    return {
      ...base,
      status: 'warn-underweight',
      tone: 'warn',
      title: 'Nousu ei käynnisty',
      body: `Trendi ${fmt(weeklyChange)} kg/vk. Bulk vaatii positiivisen tahdin — lisää kaloreita.`,
    }
  }
  return {
    ...base,
    status: 'on-track',
    tone: 'ok',
    title: 'Bulk hallitusti',
    body: `Trendi ${fmt(weeklyChange)} kg/vk vaihtelussa +0,1…+0,4 kg/vk.`,
  }
}

// ── refill ────────────────────────────────────────────────────────────────
function interpretRefill(
  period: GoalPeriod,
  trend: WeightTrend,
  today: string,
  base: Pick<TrendStatusResult, 'currentTrend' | 'weeklyChange'>,
): TrendStatusResult {
  const windowWeeks = period.refillWindowWeeks ?? 3
  const expectedKg = period.expectedRefillKg ?? 1.8
  const ceiling = expectedKg + 0.7 // hard "this is overshoot" line
  const windowEnd = addDays(period.startDate, windowWeeks * 7)
  const insideWindow = today <= windowEnd

  // Rise so far inside this refill, relative to the period's startWeight
  // (the dip the user was at when they began the refill).
  const startW = period.startWeight
  const cur = base.currentTrend ?? startW
  const riseSoFar = cur - startW

  if (insideWindow) {
    if (riseSoFar > ceiling) {
      return {
        ...base,
        status: 'refill-overshoot',
        tone: 'danger',
        title: 'Refill ylittää enveloppi',
        body: `Nousua kertynyt ${fmt(riseSoFar)} kg, katto ~${expectedKg.toFixed(1)} kg. Pienennä syöntiä ja seuraa onko tasaantumassa.`,
      }
    }
    return {
      ...base,
      status: 'refill-safe',
      tone: 'ok',
      title: 'Refill turvallisella tahdilla',
      body: `Nousua ${fmt(riseSoFar)} kg / ${expectedKg.toFixed(1)} kg tavoiteikkunassa. Odotettu nousu, ei merkki ylisyönnistä.`,
    }
  }

  // Out of the refill window. The painting on the wall: did weight plateau?
  const plateau = hasPlateaued(trend, today, 7)
  if (plateau) {
    return {
      ...base,
      status: 'on-track',
      tone: 'ok',
      title: 'Refill ohi, paino tasaantunut',
      body: `Nousu päättyi tasaantumiseen (${fmt(riseSoFar)} kg yhteensä). Siirry maintenance- tai cut-jaksoon.`,
    }
  }
  if ((base.weeklyChange ?? 0) > 0.25) {
    return {
      ...base,
      status: 'refill-not-plateauing',
      tone: 'warn',
      title: 'Refill jatkuu — näyttää ylisyönniltä',
      body: `Ikkuna umpeutunut mutta nousu jatkuu ${fmt(base.weeklyChange ?? 0)} kg/vk. Tämä erottaa refillistä: refill tasaantuu, ylisyönti ei.`,
    }
  }
  return {
    ...base,
    status: 'on-track',
    tone: 'info',
    title: 'Refill päättymässä',
    body: `Nousua ${fmt(riseSoFar)} kg, ikkuna umpeutunut. Seuraa muutaman päivän että tasaantuu — siirry sitten seuraavaan jaksoon.`,
  }
}
