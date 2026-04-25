import type { WeightEntry, Meal, Settings, WeightTrend, TdeeEvalResult } from '../types'
import { toISO, addDays, daysBetween, getWeekdayNum } from './dates'

export function computeWeightTrend(weights: WeightEntry[]): WeightTrend {
  const valid = weights
    .filter((w) => !w.excludeFromTrend && w.kg)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (valid.length < 2) {
    return { trendData: [], currentTrend: null, weeklyChange: null }
  }

  const trendData = valid.map((w, i) => {
    const start = Math.max(0, i - 6)
    const window = valid.slice(start, i + 1)
    const avg = window.reduce((s, x) => s + x.kg, 0) / window.length
    return { date: w.date, kg: w.kg, trend: avg, windowSize: window.length }
  })

  const currentTrend = trendData[trendData.length - 1].trend

  let weeklyChange: number | null = null
  if (trendData.length >= 8) {
    const weekAgo = trendData[trendData.length - 8].trend
    weeklyChange = currentTrend - weekAgo
  } else if (trendData.length >= 4) {
    const first = trendData[0].trend
    const days = daysBetween(trendData[0].date, trendData[trendData.length - 1].date)
    if (days > 0) {
      weeklyChange = ((currentTrend - first) / days) * 7
    }
  }

  return { trendData, currentTrend, weeklyChange }
}

export function estimateTdeeAdjustment(
  weights: WeightEntry[],
  meals: Meal[],
  settings: Settings,
): TdeeEvalResult | null {
  const trend = computeWeightTrend(weights)
  if (!trend.weeklyChange) return null

  const validWeights = weights.filter((w) => !w.excludeFromTrend)

  if (validWeights.length < 14) {
    return {
      ready: false,
      message: `Tarvitaan ${14 - validWeights.length} pv lisää painodataa ennen TDEE-arviointia`,
      daysCollected: validWeights.length,
    }
  }

  const todayISO = toISO(new Date())
  const startISO = addDays(todayISO, -14)

  const recentMeals = meals.filter((m) => m.date >= startISO && m.date < todayISO)
  if (recentMeals.length < 7) {
    return {
      ready: false,
      message: 'Liian vähän kcal-kirjauksia — kirjaa ainakin 7 pv viimeisestä 14 päivästä',
      daysCollected: validWeights.length,
    }
  }

  const dailyKcal: Record<string, number> = {}
  recentMeals.forEach((m) => {
    dailyKcal[m.date] = (dailyKcal[m.date] ?? 0) + Number(m.kcal)
  })

  const daysWithKcal = Object.keys(dailyKcal)
  const avgConsumed =
    Object.values(dailyKcal).reduce((s, k) => s + k, 0) / daysWithKcal.length

  const tdeeArr = daysWithKcal.map((dateISO) => {
    const dow = getWeekdayNum(dateISO)
    const dayType = settings.weeklyPattern[dow] ?? 'rest'
    return settings.tdee[dayType]
  })
  const avgAssumedTdee = tdeeArr.reduce((s, v) => s + v, 0) / tdeeArr.length

  const assumedDailyDeficit = avgAssumedTdee - avgConsumed
  const trendImpliedDailyDeficit = (-trend.weeklyChange * 7700) / 7
  const realTdeeEstimate = avgConsumed + trendImpliedDailyDeficit
  const tdeeError = avgAssumedTdee - realTdeeEstimate
  const significantError = Math.abs(tdeeError) >= 100

  return {
    ready: true,
    weeklyChange: trend.weeklyChange,
    assumedDailyDeficit,
    trendImpliedDailyDeficit,
    avgConsumed,
    avgAssumedTdee,
    realTdeeEstimate,
    tdeeError,
    significantError,
    direction: tdeeError > 0 ? 'lower' : 'higher',
    daysCollected: validWeights.length,
  }
}
