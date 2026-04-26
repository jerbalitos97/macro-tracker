import type {
  Settings,
  SpecialEvent,
  ExtraWorkout,
  Meal,
  TrainingBurn,
  ComputedDay,
  ComputedResult,
} from '../types'
import { addDays, daysBetween, getWeekdayNum, toISO } from './dates'

export function computeDays(
  settings: Settings,
  events: SpecialEvent[],
  extras: ExtraWorkout[],
  meals: Meal[],
  burns: TrainingBurn[] = [],
): ComputedResult {
  const days: ComputedDay[] = []
  const total = daysBetween(settings.startDate, settings.endDate) + 1

  const weightLossKg = settings.startWeight - settings.targetWeight
  const totalDeficitTarget = weightLossKg * 7700
  const dailyDeficitBase = totalDeficitTarget / total

  for (let i = 0; i < total; i++) {
    const date = addDays(settings.startDate, i)
    const dow = getWeekdayNum(date)

    const eventOnDay = events.find((e) => e.date === date)

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

    const dayType = settings.weeklyPattern[dow] ?? 'rest'
    const baseTdee = settings.tdee[dayType] ?? settings.tdee.rest

    let budget: number
    let note = ''

    if (eventOnDay) {
      budget = baseTdee - dailyDeficitBase + Number(eventOnDay.excessKcal)
      note = `🎉 ${eventOnDay.name} (+${eventOnDay.excessKcal})`
    } else {
      budget = baseTdee - dailyDeficitBase - preBufferReduction + extraKcal
      if (preBufferReduction > 0) note = `pre-buffer −${preBufferReduction}`
      if (extraKcal > 0) {
        note = note ? `${note} · treeni +${extraKcal}` : `treeni +${extraKcal}`
      }
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
      event: eventOnDay ?? null,
      note,
      dailyDeficitBase: Math.round(dailyDeficitBase),
    })
  }

  const todayISO = toISO(new Date())
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
