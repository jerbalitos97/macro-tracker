// One file containing everything needed to reason about goals and results.
//
// The raw logs alone are awkward to analyse — the interesting facts for any
// given day are spread across meals, burns, adjustments, events and the goal
// period in force at the time. So the export leads with `days`: one row per
// day with all of that already joined and the plan-vs-actual arithmetic done.
// The raw collections follow, so nothing is lost and any number can be traced
// back to what produced it.
//
// `_readme` travels inside the file. Whoever opens it — a person, or an
// assistant being asked to look for patterns — can read what each field means
// without the app.
import type { AppData, ComputedDay } from '../types'
import { loadData } from './storage'
import { computeDays } from './compute'
import { getPeriods } from './goalPeriods'
import { computeWeightTrend } from './weight'
import { getTemplates, getWorkouts } from './workouts'
import { getBlocks } from './blocks'
import { toISO } from './dates'

const SCHEMA_VERSION = 1

const README: Record<string, string> = {
  days:
    'One row per day of the active goal period. dayType/tdee come from the weekly ' +
    'pattern; plannedDeficit is what the plan asked of that day (0 on weekends when ' +
    'weekendMaintenance is on); budget = tdee − plannedDeficit ± events, buffers, ' +
    'training and manual adjustments. eaten/protein are logged food. burned is ' +
    'logged training. actualDeficit = tdee + extraKcal − (eaten − burned), and is ' +
    'null on days with nothing logged — those are gaps, not zeros.',
  weightTrend:
    '7-day moving average of morning weights. trend is the smoothed value, kg the ' +
    'raw reading. Judge progress on trend; raw weight moves with water and food.',
  goalPeriods:
    'The goal history. type is cut/maintenance/refill/bulk, status active/achieved/' +
    'ended. weekendMaintenance means the period pushed its whole deficit onto ' +
    'weekdays and ate at maintenance on Sat/Sun.',
  settings:
    'tdee is kcal by day type; weeklyPattern maps weekday (0=Sunday) to day type. ' +
    'The top-level startDate/endDate/startWeight/targetWeight are the legacy goal ' +
    'fields, superseded by goalPeriods when those exist.',
  workouts: 'Completed training sessions: exercises, sets, reps, weights, timestamps.',
  workoutTemplates: 'Reusable session plans the workouts were started from.',
  trainingBlocks: 'Mesocycles: named date ranges with an intent, e.g. a strength block.',
  raw: 'The unjoined logs the day rows were built from, for tracing any number back.',
  notIncluded:
    'Habit tracking and the wealth tool live in separate stores and are not part of ' +
    'this export.',
}

export interface ExportBundle {
  _readme: Record<string, string>
  schemaVersion: number
  exportedAt: string
  app: string
  days: Array<Record<string, unknown>>
  weightTrend: Array<{ date: string; kg: number; trend: number }>
  goalPeriods: unknown[]
  settings: unknown
  workouts: unknown[]
  workoutTemplates: unknown[]
  trainingBlocks: unknown[]
  raw: Record<string, unknown>
}

function dayRow(d: ComputedDay): Record<string, unknown> {
  return {
    date: d.date,
    weekday: ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.dow],
    isWeekend: d.dow === 0 || d.dow === 6,
    dayType: d.dayType,
    tdee: d.baseTdee,
    plannedDeficit: d.dailyDeficitBase,
    budget: d.budget,
    eaten: d.consumed,
    protein: d.protein,
    burned: d.burnKcal,
    extraKcal: d.extraKcal,
    preBufferReduction: d.preBufferReduction,
    adjustmentKcal: d.adjustment?.kcal ?? 0,
    adjustmentNote: d.adjustment?.note ?? null,
    events: d.events.map((e) => ({ name: e.name, excessKcal: e.excessKcal })),
    // null, not 0: a day with nothing logged is missing data, and averaging a
    // zero into it would quietly understate every result built on top.
    actualDeficit: d.consumed > 0 || d.burnKcal > 0 ? Math.round(d.actualDeficit ?? 0) : null,
    vsPlan:
      d.consumed > 0 || d.burnKcal > 0
        ? Math.round((d.actualDeficit ?? 0) - d.dailyDeficitBase)
        : null,
    note: d.note || null,
  }
}

export function buildExport(): ExportBundle | null {
  const data: AppData | null = loadData()
  if (!data) return null

  const computed = computeDays(
    data.settings,
    data.events ?? [],
    data.extras ?? [],
    data.meals ?? [],
    data.burns ?? [],
    data.adjustments ?? [],
  )
  const trend = computeWeightTrend(data.weights ?? [])

  return {
    _readme: README,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Friday',
    days: computed.days.map(dayRow),
    weightTrend: trend.trendData.map((t) => ({
      date: t.date,
      kg: t.kg,
      trend: Math.round(t.trend * 100) / 100,
    })),
    goalPeriods: getPeriods(data.settings),
    settings: data.settings,
    workouts: getWorkouts(),
    workoutTemplates: getTemplates(),
    trainingBlocks: getBlocks(),
    raw: {
      meals: data.meals ?? [],
      weights: data.weights ?? [],
      trainingBurns: data.burns ?? [],
      specialEvents: data.events ?? [],
      extraWorkouts: data.extras ?? [],
      dailyAdjustments: data.adjustments ?? [],
    },
  }
}

export type ExportOutcome = 'shared' | 'downloaded' | 'no-data' | 'cancelled' | 'failed'

/** Hands the file to the OS share sheet where that exists — on an installed
 *  PWA that is the only route to Files, AirDrop or another app — and falls back
 *  to a plain download elsewhere. */
export async function exportAll(): Promise<ExportOutcome> {
  const bundle = buildExport()
  if (!bundle) return 'no-data'

  const json = JSON.stringify(bundle, null, 2)
  const filename = `friday-export-${toISO(new Date())}.json`
  const file = new File([json], filename, { type: 'application/json' })

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Friday export' })
      return 'shared'
    } catch (e) {
      // The user dismissing the sheet is not an error worth reporting.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Anything else: fall through to the download path rather than dead-end.
    }
  }

  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
