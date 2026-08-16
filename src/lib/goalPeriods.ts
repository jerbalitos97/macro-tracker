// Source of truth for "which goal period applies when" + the legacy back-
// compat shim. Always read goals via these helpers — never poke
// settings.targetWeight / settings.startDate / settings.endDate directly.

import type { GoalPeriod, PeriodType, Settings } from '../types'
import { daysBetween } from './dates'

/** Synthesise a single 'cut' period from the legacy single-target settings
 *  fields. Used as a fallback when settings.goalPeriods is absent/empty. */
function legacyPeriod(settings: Settings): GoalPeriod {
  return {
    id: 1,
    type: 'cut',
    status: 'active',
    startDate: settings.startDate,
    endDate: settings.endDate,
    startWeight: settings.startWeight,
    targetWeight: settings.targetWeight,
    label: '',
    createdAt: new Date(0).toISOString(),
  }
}

/** All periods sorted by startDate ascending. Falls back to legacy shim. */
export function getPeriods(settings: Settings): GoalPeriod[] {
  const list = settings.goalPeriods ?? []
  if (list.length === 0) return [legacyPeriod(settings)]
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** The period currently considered "active". Priority:
 *  1. status === 'active' (most recent if multiple)
 *  2. period whose [start,end] range contains today
 *  3. most recent ended period (so the analysis still has something to show)
 *  Returns null only when there are zero periods. */
export function getActivePeriod(settings: Settings, today: string): GoalPeriod | null {
  const periods = getPeriods(settings)
  if (periods.length === 0) return null

  const actives = periods.filter((p) => p.status === 'active')
  if (actives.length > 0) {
    // newest active by startDate
    return actives.reduce((a, b) => (a.startDate >= b.startDate ? a : b))
  }
  const containing = periods.find((p) => p.startDate <= today && today <= p.endDate)
  if (containing) return containing
  // newest ended period
  return periods.reduce((a, b) => (a.endDate >= b.endDate ? a : b))
}

/** Which period (if any) covers the given date — used for chart segments. */
export function getPeriodForDate(settings: Settings, date: string): GoalPeriod | null {
  return getPeriods(settings).find((p) => p.startDate <= date && date <= p.endDate) ?? null
}

/** Ensure settings.goalPeriods exists. If not, materialise the legacy
 *  fallback as the first entry so subsequent edits (end, add) can mutate
 *  the array. Returns a new Settings object — caller must persist. */
export function materializeLegacyIfNeeded(settings: Settings): Settings {
  if (settings.goalPeriods && settings.goalPeriods.length > 0) return settings
  return {
    ...settings,
    goalPeriods: [legacyPeriod(settings)],
  }
}

/** Mark the active period as ended on `endDate` with the given status. */
export function endActivePeriod(
  settings: Settings,
  endDate: string,
  status: 'achieved' | 'retired',
): Settings {
  const next = materializeLegacyIfNeeded(settings)
  const today = endDate
  const idx = (next.goalPeriods ?? []).findIndex((p) => p.status === 'active')
  if (idx === -1) return next
  const periods = [...(next.goalPeriods ?? [])]
  periods[idx] = { ...periods[idx], status, endDate: today }
  return { ...next, goalPeriods: periods }
}

/** Append a new period and mark it active. */
export function addPeriod(
  settings: Settings,
  period: Omit<GoalPeriod, 'id' | 'status' | 'createdAt'>,
): Settings {
  const next = materializeLegacyIfNeeded(settings)
  // Auto-retire any current active so only one is ever active at a time. Its
  // end date moves only when the new period starts *before* it would have
  // finished — otherwise planning a future period would silently stretch the
  // outgoing one to meet it.
  let periods = (next.goalPeriods ?? []).map((p) =>
    p.status === 'active'
      ? {
          ...p,
          status: 'retired' as const,
          endDate: period.startDate < p.endDate ? period.startDate : p.endDate,
        }
      : p,
  )
  const created: GoalPeriod = {
    ...period,
    id: Date.now(),
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  periods = [...periods, created]
  return { ...next, goalPeriods: periods }
}

/** Replace an existing period (e.g. when editing via the modal). */
export function updatePeriod(settings: Settings, periodId: number, patch: Partial<GoalPeriod>): Settings {
  const next = materializeLegacyIfNeeded(settings)
  const periods = (next.goalPeriods ?? []).map((p) =>
    p.id === periodId ? { ...p, ...patch, id: p.id } : p,
  )
  return { ...next, goalPeriods: periods }
}

/** Delete a period. */
export function removePeriod(settings: Settings, periodId: number): Settings {
  const next = materializeLegacyIfNeeded(settings)
  const periods = (next.goalPeriods ?? []).filter((p) => p.id !== periodId)
  return { ...next, goalPeriods: periods }
}

/** Everything a screen needs to talk about "the goal in force right now",
 *  derived in one place.
 *
 *  This exists because the legacy `settings.startDate/endDate/startWeight/
 *  targetWeight` fields are frozen at whatever the *first* goal was, while
 *  `computeDays` moved to the active period. Views reading them directly were
 *  mixing two different goals inside a single card — a period average taken
 *  from one and a day count taken from the other. Read the goal from here. */
export interface ActiveGoal {
  type: PeriodType
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  weekendMaintenance: boolean
  /** Inclusive length of the period in days. */
  totalDays: number
  /** Days from the start up to and including today, clamped to the period. */
  elapsedDays: number
  /** Days left after today, clamped at zero. */
  remainingDays: number
  kgToChange: number
  totalDeficitKcal: number
  /** The period average. With weekendMaintenance the per-day plan varies —
   *  see ComputedDay.dailyDeficitBase for what any given day actually asks. */
  dailyDeficitKcal: number
  /** kg per week the period is asking for. */
  weeklyRateKg: number
}

export function getActiveGoal(settings: Settings, today: string): ActiveGoal {
  const p = getActivePeriod(settings, today) ?? legacyPeriod(settings)
  const totalDays = Math.max(1, daysBetween(p.startDate, p.endDate) + 1)
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(p.startDate, today) + 1))
  const kgToChange = p.startWeight - p.targetWeight
  const plansDeficit = p.type === 'cut' || p.type === 'bulk'
  const totalDeficitKcal = plansDeficit ? kgToChange * 7700 : 0
  return {
    type: p.type,
    startDate: p.startDate,
    endDate: p.endDate,
    startWeight: p.startWeight,
    targetWeight: p.targetWeight,
    weekendMaintenance: p.weekendMaintenance ?? false,
    totalDays,
    elapsedDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    kgToChange,
    totalDeficitKcal,
    dailyDeficitKcal: totalDeficitKcal / totalDays,
    weeklyRateKg: (kgToChange / totalDays) * 7,
  }
}
