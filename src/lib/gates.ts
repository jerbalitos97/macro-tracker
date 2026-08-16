// Daily readiness gates.
//
// Four gates run before every session, always in the same order, because they
// answer different questions and the later ones only make sense once the
// earlier one has:
//
//   1. CONDITION — where are you training? Picks the *pool* of movements that
//      are possible at all (lib/locations.ts + the env resolution in
//      lib/sessionResolve.ts).
//   2–4. KNEE / BACK / WRIST — how is the body today? Picks the *intensity*
//      within that pool.
//
// This module is the health half, and it is deliberately pure: scores and
// history in, states out, no storage and no UI. That is what makes the
// thresholds testable, and thresholds are the part that must not drift.
//
// Two design points worth keeping:
//
//   · The gates run on every session even when nothing is asked. Silence is
//     "develop", not "unknown" — an unasked gate still has to produce a state
//     for the session to resolve against.
//   · A region's own history sets its bar. "Stiff" means stiff *for you this
//     fortnight*, so the back gate compares against a rolling median rather
//     than a fixed number. Somebody whose baseline is 4 is not injured for
//     scoring 4.

import { addDays, daysBetween, toISO } from './dates'

export type BodyRegion = 'knee' | 'back' | 'wrist'
export type GateState = 'develop' | 'hybrid' | 'treat' | 'rest' | 'escalate'
export type AssessmentSource = 'asked' | 'manual' | 'inferred'

/** Symptoms that are not a matter of load management. Either one stops the
 *  app from prescribing anything and sends the user to a professional. */
export type RedFlag = 'backRadiating' | 'wristInstability'

export const RED_FLAG_REGION: Record<RedFlag, BodyRegion> = {
  backRadiating: 'back',
  wristInstability: 'wrist',
}

export const RED_FLAG_LABEL: Record<RedFlag, string> = {
  backRadiating: 'Selkä: säteilyä tai puutumista jalkaan',
  wristInstability: 'Ranne: napsumista tai pettämisen tunnetta kuormalla',
}

export const REGION_LABEL: Record<BodyRegion, string> = {
  knee: 'Polvi',
  back: 'Selkä',
  wrist: 'Ranne',
}

export const REGION_QUESTION: Record<BodyRegion, string> = {
  knee: 'Polvi testikyykyn jälkeen? (yksi kyykky laskevalla lankulla, 0–10)',
  back: 'Selän aamujäykkyys? (0–10)',
  wrist: 'Ranne nyt / eilisen jälkeen? (kipu ekstensiossa, 0–10)',
}

export const GATE_LABEL: Record<GateState, string> = {
  develop: 'kehittävä',
  hybrid: 'hybridi',
  treat: 'hoitava',
  rest: 'lepo',
  escalate: 'ammattilaiselle',
}

export interface Assessment {
  id: string
  /** ISO yyyy-mm-dd. */
  date: string
  bodyRegion: BodyRegion
  /** 0–10. */
  score: number
  redFlags: RedFlag[]
  gateOutput: GateState
  source: AssessmentSource
  /** ISO timestamp; two assessments can share a date when one is a correction. */
  createdAt: string
}

export type Trend = 'rising' | 'stable' | 'falling' | 'unknown'
export type Response24h = 'recovered' | 'elevated' | 'worse' | 'unknown'

export interface RegionHistory {
  region: BodyRegion
  /** Rolling median of the previous 14 days, excluding today. Null until there
   *  is any history — a first-ever reading cannot be elevated against nothing. */
  baseline: number | null
  trend7d: Trend
  /** Did the reading taken after the last loading session come back down? */
  resp24h: Response24h
  /** Most recent score before today. */
  previous: number | null
  /** True when the region wants asking about today. */
  flagged: boolean
}

const BASELINE_DAYS = 14
const TREND_DAYS = 7
/** Change in mean score over the trend window that counts as a real move. */
const TREND_DELTA = 0.75

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Latest assessment per day, newest first. A day can hold a corrected entry;
 *  the last one written wins. */
function dailySeries(all: Assessment[], region: BodyRegion, before: string): Assessment[] {
  const byDate = new Map<string, Assessment>()
  for (const a of all) {
    if (a.bodyRegion !== region) continue
    if (a.date >= before) continue
    const prev = byDate.get(a.date)
    if (!prev || a.createdAt >= prev.createdAt) byDate.set(a.date, a)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** Days on which the region was loaded. Sessions that gated on the region are
 *  the honest answer; before gates existed every completed session counted, so
 *  that is the fallback rather than pretending there is no history. */
export interface LoadDay {
  date: string
  regions: BodyRegion[] | 'all'
}

export function deriveRegionHistory(
  all: Assessment[],
  region: BodyRegion,
  today: string,
  loadDays: LoadDay[] = [],
): RegionHistory {
  const series = dailySeries(all, region, today)
  const recent = series.filter((a) => daysBetween(a.date, today) <= BASELINE_DAYS)
  const baseline = median(recent.map((a) => a.score))
  const previous = series.length > 0 ? series[0].score : null

  // ── trend over the last week ──
  let trend7d: Trend = 'unknown'
  const window = series.filter((a) => daysBetween(a.date, today) <= TREND_DAYS)
  if (window.length >= 4) {
    const half = Math.floor(window.length / 2)
    const newer = mean(window.slice(0, half).map((a) => a.score))
    const older = mean(window.slice(half).map((a) => a.score))
    trend7d = newer - older >= TREND_DELTA ? 'rising' : older - newer >= TREND_DELTA ? 'falling' : 'stable'
  } else if (window.length >= 2) {
    const d = window[0].score - window[window.length - 1].score
    trend7d = d >= TREND_DELTA ? 'rising' : d <= -TREND_DELTA ? 'falling' : 'stable'
  }

  // ── did the last loading session settle? ──
  let resp24h: Response24h = 'unknown'
  const loads = loadDays
    .filter((d) => d.date < today && (d.regions === 'all' || d.regions.includes(region)))
    .sort((a, b) => b.date.localeCompare(a.date))
  if (loads.length > 0 && baseline !== null) {
    const after = series.filter((a) => a.date > loads[0].date).slice(-1)[0]
    if (after) {
      resp24h =
        after.score <= baseline + 1 ? 'recovered' : after.score >= baseline + 3 ? 'worse' : 'elevated'
    }
  }

  const flagged =
    trend7d === 'rising' ||
    resp24h === 'elevated' ||
    resp24h === 'worse' ||
    (baseline !== null && previous !== null && previous >= baseline + 2)

  return { region, baseline, trend7d, resp24h, previous, flagged }
}

// ── The gates themselves ───────────────────────────────────────────────────
//
// Written as three separate functions rather than one table because the three
// regions genuinely differ. The back has no REST state: a stiff back wants
// lighter load and more movement, not a day on the sofa. The wrist gate reads
// as equipment ("do it on parallettes") rather than permission. Only the knee
// has a real stop.

export function kneeGate(score: number, h: RegionHistory): GateState {
  if (score > 7 || h.resp24h === 'worse') return 'rest'
  if (score > 5 || h.resp24h === 'elevated') return 'treat'
  if (score >= 3 || h.trend7d === 'rising') return 'hybrid'
  return 'develop'
}

export function backGate(score: number, h: RegionHistory): GateState {
  // Without history the score has nothing to be elevated against, so the first
  // reading is its own baseline and lands on develop.
  const base = h.baseline ?? score
  if (score >= base + 3 || (h.trend7d === 'rising' && score >= base + 2)) return 'treat'
  if (score >= base + 1 || h.resp24h === 'elevated') return 'hybrid'
  return 'develop'
}

export function wristGate(score: number, h: RegionHistory): GateState {
  if (score > 5 || h.resp24h === 'worse') return 'treat'
  if (score >= 3 || h.trend7d === 'rising') return 'hybrid'
  return 'develop'
}

const GATE_FN: Record<BodyRegion, (score: number, h: RegionHistory) => GateState> = {
  knee: kneeGate,
  back: backGate,
  wrist: wristGate,
}

export interface GateInput {
  /** Score for the region, when one was given. */
  score?: number
  history: RegionHistory
}

export interface GateResult {
  region: BodyRegion
  state: GateState
  source: AssessmentSource
  /** The score the state was derived from, if any. */
  score?: number
}

/** Run one region's gate. A red flag short-circuits everything: no score, no
 *  history and no threshold can override it, and it is the only path to
 *  escalate. */
export function runGate(
  region: BodyRegion,
  input: GateInput,
  redFlags: RedFlag[] = [],
  source: AssessmentSource = 'asked',
): GateResult {
  if (redFlags.some((f) => RED_FLAG_REGION[f] === region)) {
    return { region, state: 'escalate', source, score: input.score }
  }
  // An unasked gate still produces a state; silence means develop.
  if (input.score == null) return { region, state: 'develop', source: 'inferred' }
  const state = GATE_FN[region](clampScore(input.score), input.history)
  return { region, state, source, score: clampScore(input.score) }
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(10, Math.max(0, Math.round(n)))
}

export const ALL_REGIONS: BodyRegion[] = ['knee', 'back', 'wrist']

export interface DayCheck {
  /** Scores actually supplied, by region. */
  scores: Partial<Record<BodyRegion, number>>
  redFlags: RedFlag[]
  source: AssessmentSource
}

export type GateStates = Record<BodyRegion, GateResult>

/** Resolve every region for a session. */
export function runAllGates(
  check: DayCheck,
  histories: Record<BodyRegion, RegionHistory>,
): GateStates {
  const out = {} as GateStates
  for (const region of ALL_REGIONS) {
    out[region] = runGate(
      region,
      { score: check.scores[region], history: histories[region] },
      check.redFlags,
      check.source,
    )
  }
  return out
}

/** Assessment records to persist for a resolved session. */
export function assessmentsFrom(
  states: GateStates,
  dateISO: string,
  redFlags: RedFlag[],
): Assessment[] {
  const now = new Date().toISOString()
  return ALL_REGIONS.map((region) => ({
    id: `${dateISO}-${region}-${now}`,
    date: dateISO,
    bodyRegion: region,
    score: states[region].score ?? 0,
    redFlags: redFlags.filter((f) => RED_FLAG_REGION[f] === region),
    gateOutput: states[region].state,
    source: states[region].source,
    createdAt: now,
  }))
}

/** Convenience for callers that only have a date: yesterday, in ISO. */
export function yesterdayOf(dateISO: string): string {
  return addDays(dateISO, -1)
}

export const todayISO = () => toISO(new Date())
