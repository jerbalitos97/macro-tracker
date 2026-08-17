// One file containing everything the app knows.
//
// The raw logs alone are awkward to analyse — the interesting facts for any
// given day are spread across meals, burns, adjustments, events and the goal
// period in force at the time. So the export leads with `days`: one row per
// day with all of that already joined and the plan-vs-actual arithmetic done.
// The structured collections follow, so nothing is lost and any number can be
// traced back to what produced it.
//
// ─────────────────────────────────────────────────────────────────────────
// COMPLETENESS IS A REQUIREMENT, NOT AN INTENTION.
//
// This file is what gets handed to an assistant for analysis, so anything the
// app stores and this file omits is invisible in that conversation — and the
// omission is silent, which is the dangerous part. Remembering to add each new
// store here is exactly the kind of promise that gets broken, so it is not
// relied on:
//
//   · Every localStorage key is swept at export time. Anything not claimed by
//     a named section below lands in `raw.unmapped` verbatim. A store added
//     later and never registered here still ships — worse-labelled than it
//     could be, but present.
//   · Cloud-only collections (habits, wealth) cannot be swept that way, so
//     they are fetched explicitly. When a new cloud table appears, add it to
//     `fetchCloud` — and note that the sweep will not cover it for you.
//   · SENSITIVE_KEYS never ship. The auth session holds a bearer token; a file
//     meant to be shared must not carry it.
//
// If you add a store and do nothing else, the data is still here. If you add a
// store and register it below, it is here *and* named.
// ─────────────────────────────────────────────────────────────────────────
import type { AppData, ComputedDay } from '../types'
import { loadData } from './storage'
import { computeDays } from './compute'
import { getPeriods, getActiveGoal } from './goalPeriods'
import { recommendProtein, intentOf } from './planning'
import { computeWeightTrend } from './weight'
import { getTemplates, getWorkouts, getDraft } from './workouts'
import { getBlocks, blockForDate } from './blocks'
import { getWarmup } from './warmup'
import { getRestLog } from './restTimer'
import { getLocations } from './locations'
import { getPrefs } from './uiPrefs'
import { getAcknowledgedSurpluses } from './surplusAck'
import { listHabits, listEntries } from './habits'
import { listAssets, listAllValues } from './wealth/assets'
import { getSettings as getWealthSettings } from './wealth/settings'
import { toISO } from './dates'

const SCHEMA_VERSION = 4

/** Never exported. The auth session carries a bearer token. */
const SENSITIVE_KEYS = ['makrot:session']

/** localStorage keys already represented by a named section. Anything else is
 *  swept into raw.unmapped rather than dropped. */
const MAPPED_KEYS = [
  'cutdata:v1',                        // settings, meals, weights, burns, events, extras, adjustments
  'cutdata:surplus-ack:v1',            // surplusAcknowledged
  'mimir.workouts.history:v1',         // workouts
  'mimir.workouts.templates:v1',       // workoutTemplates
  'mimir.workouts.draft:v1',           // workoutDraft
  'mimir.workouts.blocks:v1',          // trainingBlocks
  'mimir.workouts.warmup:v1',          // warmupRoutine
  'mimir.workouts.restLog:v1',         // restLog
  'mimir.workouts.restTimer:v1',       // activeRest (transient; swept for completeness)
  'friday.uiPrefs:v1',                 // uiPrefs
  'mimir.workouts.locations:v1',       // trainingLocations
  'mimir.workouts.lastLocation:v1',    // (transient: which chip is preselected)
]

const README: Record<string, string> = {
  days:
    'One row per day of the active goal period. dayType/tdee come from the weekly ' +
    'pattern; plannedDeficit is what the plan asked of that day (0 on weekends when ' +
    'weekendMaintenance is on); budget = tdee − plannedDeficit ± events, buffers, ' +
    'training and manual adjustments. eaten/protein are logged food. burned is ' +
    'logged training. proteinTarget is the target in force and proteinVsTarget the ' +
    'shortfall or surplus that day. actualDeficit = tdee + extraKcal − (eaten − ' +
    'burned), and is null on days with nothing logged — those are gaps, not zeros.',
  weightTrend:
    '7-day moving average of morning weights. trend is the smoothed value, kg the ' +
    'raw reading. Judge progress on trend; raw weight moves with water and food. ' +
    'Weekend readings are deliberately kept in: every 7-day window spans exactly ' +
    'one weekend, so the water cancels out of any comparison between two points.',
  goalPeriods:
    'The goal history. type is cut/maintenance/refill/bulk, status active/achieved/' +
    'ended. weekendMaintenance means the period pushed its whole deficit onto ' +
    'weekdays and ate at maintenance on Sat/Sun. blockId links a period to the ' +
    'training block it was planned against.',
  settings:
    'tdee is kcal by day type; weeklyPattern maps weekday (0=Sunday) to day type. ' +
    'heightCm/birthYear/sex feed the workout burn estimate. The top-level ' +
    'startDate/endDate/startWeight/targetWeight are the legacy goal fields, ' +
    'superseded by goalPeriods when those exist.',
  workouts:
    'Completed sessions: exercises, sets, reps, weights, timestamps. warmupDone is ' +
    'the per-session tick that a warm-up happened. locationId says where, and ' +
    'assessments what the body reported that day. Each exercise carries a ' +
    'resolution: baseName is the slot the template asked for, slotId the template ' +
    'exercise id it came from (join on that rather than on names, which repeat — ' +
    'absent on sessions logged before it existed and on exercises added by hand), ' +
    'gateRegion/gateState why this variant, envFallback whether the room forced a ' +
    'substitute, and unavailable whether it was dropped (env = impossible here, ' +
    'gate = off today). That is what makes variant-versus-result analysable after ' +
    'the fact.',
  workoutTemplates:
    'Reusable session plans. archivedAt marks a retired template — retired, not ' +
    'deleted, so old sessions still point at something. An exercise may carry env ' +
    '(what the room must provide, and the substitute when it does not) and gate ' +
    '(which body region sets its intensity, and the variant per state). A gate ' +
    'variant may carry its own env, and an env fallback may carry env in turn: ' +
    'equipment substitution is a chain walked until the room can host something, ' +
    'so "no trap bar" can end at a bodyweight hinge two steps down. A fallback of ' +
    'null ends the chain and drops the slot instead of substituting.',
  trainingLocations:
    'Where sessions happen, as capability flags — external load, muscle-up bar, ' +
    'plyo box, anchor and band, parallettes, trap bar. The condition gate resolves ' +
    'against these before any health gate runs: the room decides which movements ' +
    'exist, the body decides how hard. These profiles live in the database, not in ' +
    'the app: an empty list here means the device had not synced, not that the user ' +
    'trains nowhere.',
  assessments:
    'Daily readiness readings, one per body region per session. score is 0–10, ' +
    'gateOutput is what the gate decided (develop/hybrid/treat/rest/escalate) and ' +
    'source says whether it was asked, entered by hand, or inferred from silence. ' +
    'Thresholds are relative to the region\'s own 14-day median, so a score is only ' +
    'meaningful next to its baseline. escalate means a red flag was ticked and the ' +
    'app stopped prescribing — it is not a severity level.',
  workoutDraft: 'A session in progress at export time, if any.',
  trainingBlocks:
    'Mesocycles: named date ranges with an intent (base/strength/skill/peak/deload) ' +
    'that sets how much deficit the block tolerates.',
  warmupRoutine: 'The warm-up routine itself — one list, not copied per session.',
  restLog:
    'Rest periods timed between sets: seconds is the rest actually taken, targetSec ' +
    'what was aimed for. The timer counts up and ends manually, so seconds > ' +
    'targetSec is normal and meaningful.',
  habits: 'Habit definitions and their daily entries (cloud-stored).',
  wealth: 'Assets, their valuations over time, and the wealth goal (cloud-stored).',
  uiPrefs: 'Saved UI arrangement, e.g. the order of tools on the launcher.',
  protein:
    'target is the figure in force; recommended is what the active training block and ' +
    'nutrition phase call for, with the reasoning. A target set above the recommendation ' +
    'is usually a deliberate buffer for days that fall short — judge adherence on ' +
    'averageIntake, not on any single day. daysMetTarget counts days at or above target ' +
    'among days with food logged. Per-day figures are on days[].proteinTarget / ' +
    'proteinVsTarget.',
  surplusAcknowledged: 'Days whose surplus prompt was answered, so it is not re-offered.',
  raw:
    'The unjoined logs the day rows were built from. raw.unmapped holds any local ' +
    'store that has no named section above — present so that nothing the app saves ' +
    'is ever silently missing from this file.',
  notIncluded:
    'The authentication session is deliberately excluded: it holds a bearer token ' +
    'and this file is meant to be shareable.',
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
  workoutDraft: unknown
  trainingBlocks: unknown[]
  warmupRoutine: unknown[]
  restLog: unknown[]
  habits: { definitions: unknown[]; entries: unknown[] } | null
  wealth: { assets: unknown[]; values: unknown[]; settings: unknown } | null
  uiPrefs: unknown
  surplusAcknowledged: string[]
  trainingLocations: unknown[]
  assessments: unknown[]
  protein: {
    target: number
    recommended: number
    recommendedPerKg: number
    recommendationReasons: string[]
    bodyWeightKg: number | null
    loggedDays: number
    daysMetTarget: number
    averageIntake: number | null
    averagePerKg: number | null
  }
  raw: Record<string, unknown>
}

function dayRow(d: ComputedDay, proteinTarget: number): Record<string, unknown> {
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
    proteinTarget: proteinTarget,
    proteinVsTarget: d.consumed > 0 ? Math.round(d.protein - proteinTarget) : null,
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

/** Protein: what was asked for, what is recommended, and what actually went in.
 *  Logged protein was already exported per day, but the target was only a
 *  single number buried in settings and the recommendation existed nowhere —
 *  so adherence could not be judged from the file alone. */
function proteinSummary(
  data: AppData,
  days: ComputedDay[],
  bodyWeightKg: number | null,
): ExportBundle['protein'] {
  const target = data.settings.proteinTarget
  const today = toISO(new Date())
  const goal = getActiveGoal(data.settings, today)
  const block = blockForDate(getBlocks(), today)
  const weight = bodyWeightKg ?? goal.startWeight

  const advice = recommendProtein({
    bodyWeightKg: weight,
    intent: block ? intentOf(block) : null,
    periodType: goal.type,
    plannedWeeklyLossKg: goal.weeklyRateKg,
  })

  const logged = days.filter((d) => d.consumed > 0)
  const totalProtein = logged.reduce((sum, d) => sum + d.protein, 0)

  return {
    target,
    recommended: advice.grams,
    recommendedPerKg: advice.gramsPerKg,
    recommendationReasons: advice.reasons,
    bodyWeightKg: bodyWeightKg == null ? null : Math.round(bodyWeightKg * 100) / 100,
    loggedDays: logged.length,
    daysMetTarget: logged.filter((d) => d.protein >= target).length,
    averageIntake: logged.length > 0 ? Math.round(totalProtein / logged.length) : null,
    averagePerKg:
      logged.length > 0 && weight > 0
        ? Math.round((totalProtein / logged.length / weight) * 100) / 100
        : null,
  }
}

/** Every localStorage key that no named section claims. This is the safety
 *  net: a store added later and never registered still reaches the file. */
function sweepUnmapped(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let n = 0
  try {
    n = localStorage.length
  } catch {
    return out
  }
  for (let i = 0; i < n; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (SENSITIVE_KEYS.includes(key)) continue
    if (MAPPED_KEYS.includes(key)) continue
    const raw = localStorage.getItem(key)
    if (raw == null) continue
    try {
      out[key] = JSON.parse(raw)
    } catch {
      out[key] = raw
    }
  }
  return out
}

/** Cloud-only collections. The localStorage sweep cannot reach these, so any
 *  new cloud table has to be added here by hand. */
async function fetchCloud(userId: string | undefined): Promise<{
  habits: ExportBundle['habits']
  wealth: ExportBundle['wealth']
}> {
  const [habits, wealth] = await Promise.all([
    (async () => {
      if (!userId) return null
      try {
        const [definitions, entries] = await Promise.all([listHabits(userId), listEntries(userId)])
        return { definitions, entries }
      } catch {
        return null
      }
    })(),
    (async () => {
      try {
        const [assets, values, settings] = await Promise.all([
          listAssets(),
          listAllValues(),
          getWealthSettings(),
        ])
        return { assets, values, settings }
      } catch {
        return null
      }
    })(),
  ])
  return { habits, wealth }
}

export async function buildExport(userId?: string): Promise<ExportBundle | null> {
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
  const { habits, wealth } = await fetchCloud(userId)

  return {
    _readme: README,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Friday',
    days: computed.days.map((d) => dayRow(d, data.settings.proteinTarget)),
    weightTrend: trend.trendData.map((t) => ({
      date: t.date,
      kg: t.kg,
      trend: Math.round(t.trend * 100) / 100,
    })),
    goalPeriods: getPeriods(data.settings),
    settings: data.settings,
    workouts: getWorkouts(),
    workoutTemplates: getTemplates(),
    workoutDraft: getDraft(),
    trainingBlocks: getBlocks(),
    warmupRoutine: getWarmup(),
    restLog: getRestLog(),
    habits,
    wealth,
    uiPrefs: getPrefs(),
    surplusAcknowledged: [...getAcknowledgedSurpluses()],
    trainingLocations: getLocations(),
    // Flattened out of the sessions as their own series, because that is how
    // the gates read them: baseline, trend and 24h response are properties of
    // the region over time, not of any one workout.
    assessments: getWorkouts().flatMap((w) => w.assessments ?? []),
    protein: proteinSummary(data, computed.days, trend.currentTrend),
    raw: {
      meals: data.meals ?? [],
      weights: data.weights ?? [],
      trainingBurns: data.burns ?? [],
      specialEvents: data.events ?? [],
      extraWorkouts: data.extras ?? [],
      dailyAdjustments: data.adjustments ?? [],
      unmapped: sweepUnmapped(),
    },
  }
}

export type ExportOutcome = 'shared' | 'downloaded' | 'no-data' | 'cancelled' | 'failed'

/** Hands the file to the OS share sheet where that exists — on an installed
 *  PWA that is the only route to Files, AirDrop or another app — and falls back
 *  to a plain download elsewhere. */
export async function exportAll(userId?: string): Promise<ExportOutcome> {
  const bundle = await buildExport(userId)
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
