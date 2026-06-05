import type {
  Settings,
  SpecialEvent,
  ExtraWorkout,
  Meal,
  TrainingBurn,
  DailyAdjustment,
  ComputedDay,
  ComputedResult,
  GoalPeriod,
} from '../types'
import { addDays, daysBetween, getWeekdayNum, toISO } from './dates'
import { getActivePeriod } from './goalPeriods'

/** kcal/day deficit baseline implied by a single period's start→target over
 *  its duration. Non-cut periods convert sensibly:
 *   - maintenance: 0 kcal/day (eat at TDEE)
 *   - bulk: a negative number, i.e. a surplus, so the "deficit" is the
 *     deliberate gain that keeps the user inside the bulk envelope
 *   - refill: 0 by default — refill envelope is checked separately in
 *     `trendStatus`; we don't want refill weeks accidentally counted as a
 *     cut in the cumulative deficit chart. */
function periodDailyDeficit(p: GoalPeriod): number {
  if (p.type === 'maintenance' || p.type === 'refill') return 0
  const dur = Math.max(1, daysBetween(p.startDate, p.endDate) + 1)
  const kg = p.startWeight - p.targetWeight // positive for cut, negative for bulk
  return (kg * 7700) / dur
}

export function computeDays(
  settings: Settings,
  events: SpecialEvent[],
  extras: ExtraWorkout[],
  meals: Meal[],
  burns: TrainingBurn[] = [],
  adjustments: DailyAdjustment[] = [],
): ComputedResult {
  const days: ComputedDay[] = []
  const todayISO = toISO(new Date())
  const activePeriod = getActivePeriod(settings, todayISO)

  // Fall back to legacy fields when there's literally no period info.
  const fallbackStart = activePeriod?.startDate ?? settings.startDate
  const fallbackEnd = activePeriod?.endDate ?? settings.endDate
  const fallbackStartW = activePeriod?.startWeight ?? settings.startWeight
  const fallbackTargetW = activePeriod?.targetWeight ?? settings.targetWeight

  const total = daysBetween(fallbackStart, fallbackEnd) + 1
  const weightLossKg = fallbackStartW - fallbackTargetW
  const totalDeficitTarget = weightLossKg * 7700
  const dailyDeficitBase = activePeriod
    ? periodDailyDeficit(activePeriod)
    : totalDeficitTarget / total

  for (let i = 0; i < total; i++) {
    const date = addDays(fallbackStart, i)
    const dow = getWeekdayNum(date)

    const eventsOnDay = events.filter((e) => e.date === date)
    const eventExcessKcal = eventsOnDay.reduce((s, e) => s + Number(e.excessKcal), 0)

    let preBufferReduction = 0
    events.forEach((e) => {
      if (!e.bufferDays || e.bufferDays < 1) return
      const direction = e.bufferDirection ?? 'before'
      const diff = daysBetween(date, e.date)

      if (direction === 'before') {
        if (diff > 0 && diff <= e.bufferDays) {
          preBufferReduction += Math.round(e.excessKcal / e.bufferDays)
        }
      } else if (direction === 'after') {
        if (diff < 0 && Math.abs(diff) <= e.bufferDays) {
          preBufferReduction += Math.round(e.excessKcal / e.bufferDays)
        }
      } else if (direction === 'both') {
        const halfDays = Math.floor(e.bufferDays / 2)
        const totalSpread = halfDays * 2
        if (totalSpread > 0) {
          const perDay = Math.round(e.excessKcal / totalSpread)
          if (diff > 0 && diff <= halfDays) preBufferReduction += perDay
          if (diff < 0 && Math.abs(diff) <= halfDays) preBufferReduction += perDay
        }
      }
    })

    const extraOnDay = extras.filter((x) => x.date === date)
    const extraKcal = extraOnDay.reduce((sum, x) => sum + Number(x.kcal), 0)

    const dayBurns = burns.filter((b) => b.date === date)
    const burnKcal = dayBurns.reduce((sum, b) => sum + Number(b.kcal), 0)

    const adjustmentOnDay = adjustments.find((a) => a.date === date) ?? null
    const adjKcal = adjustmentOnDay ? Number(adjustmentOnDay.kcal) : 0

    const dayType = settings.weeklyPattern[dow] ?? 'rest'
    const baseTdee = settings.tdee[dayType] ?? settings.tdee.rest

    let budget: number
    let note = ''

    if (eventsOnDay.length > 0) {
      // Multiple events on the same day stack — all their excess kcal add to
      // the budget. preBufferReduction here only contains contributions from
      // events on *other* dates (an event landing on this date has diff=0,
      // which fails the diff > 0 / diff < 0 guards above).
      budget =
        baseTdee -
        dailyDeficitBase +
        eventExcessKcal -
        preBufferReduction +
        extraKcal +
        adjKcal
      note = eventsOnDay
        .map((e) => `🎉 ${e.name} (+${e.excessKcal})`)
        .join(' · ')
      if (preBufferReduction > 0) {
        note = `${note} · pre-buffer −${preBufferReduction}`
      }
      if (extraKcal > 0) {
        note = `${note} · treeni +${extraKcal}`
      }
    } else {
      budget = baseTdee - dailyDeficitBase - preBufferReduction + extraKcal + adjKcal
      if (preBufferReduction > 0) note = `pre-buffer −${preBufferReduction}`
      if (extraKcal > 0) {
        note = note ? `${note} · treeni +${extraKcal}` : `treeni +${extraKcal}`
      }
    }
    if (adjKcal !== 0) {
      const sign = adjKcal > 0 ? '+' : '−'
      const tag = `säätö ${sign}${Math.abs(adjKcal)}`
      note = note ? `${note} · ${tag}` : tag
    }

    const dayMeals = meals.filter((m) => m.date === date)
    const consumed = dayMeals.reduce((s, m) => s + Number(m.kcal), 0)
    const protein = dayMeals.reduce((s, m) => s + Number(m.protein), 0)

    // Net consumed: logged food minus training burns (never negative)
    const netConsumed = Math.max(0, consumed - burnKcal)

    days.push({
      date,
      dow,
      dayType,
      baseTdee,
      budget: Math.round(budget),
      consumed,
      protein,
      preBufferReduction,
      extraKcal,
      burnKcal,
      netConsumed,
      events: eventsOnDay,
      adjustment: adjustmentOnDay,
      note,
      dailyDeficitBase: Math.round(dailyDeficitBase),
    })
  }

  let cumulativeDeficit = 0
  days.forEach((d) => {
    if (d.consumed > 0 || d.burnKcal > 0) {
      // actualDeficit uses netConsumed so training burns improve the deficit
      d.actualDeficit = d.baseTdee + d.extraKcal - d.netConsumed
    }
    if (d.date < todayISO && (d.consumed > 0 || d.burnKcal > 0)) {
      cumulativeDeficit += d.actualDeficit ?? 0
    }
  })

  return {
    days,
    totalDays: total,
    weightLossKg,
    totalDeficitTarget,
    dailyDeficitBase,
    cumulativeDeficit,
  }
}
