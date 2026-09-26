// MCP server for the Friday app. Exposes high-level tools so Claude.ai (or
// Claude Code) can answer questions about your data — and, on the programming
// side, change it — without needing to know the underlying DB schema.
//
// Two halves with deliberately different rules:
//   • Nutrition, weight, habits — read only. These are a record of what
//     happened, and nothing should be able to rewrite history from a chat.
//   • Templates, blocks, warm-ups — read and write. These are a plan, and a
//     plan is exactly the thing worth shaping in conversation. Every write is
//     two-step, validated, and logged with its previous version (see the
//     OHJELMOINTI section).
//
import { createHash } from 'node:crypto'
//
// Transport: stateless Streamable HTTP. Each POST is a self-contained
// JSON-RPC request. Authentication: a single shared Bearer token
// (MCP_API_KEY) — fine for personal/single-user use. DB access uses the
// Supabase service-role key (bypasses RLS) scoped client-side to a single
// MCP_USER_ID.
//
// Required env vars on Vercel:
//   SUPABASE_URL                 — same as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    — from Supabase Settings → API → service_role
//   MCP_API_KEY                  — long random string, shared with Claude.ai
//   MCP_USER_ID                  — your auth.users.id UUID

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const USER_ID = process.env.MCP_USER_ID ?? ''
const API_KEY = process.env.MCP_API_KEY ?? ''

// ── Date helpers (mirror src/lib/dates.ts) ─────────────────────
const toISO = (d: Date) => d.toISOString().split('T')[0]
const fromISO = (s: string) => new Date(s + 'T12:00:00')
const addDays = (iso: string, n: number) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
const daysBetween = (a: string, b: string) =>
  Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)
const getWeekdayNum = (iso: string) => fromISO(iso).getDay()

// ── Domain types (mirror src/types) ────────────────────────────
type DayType = 'rest' | 'single' | 'double' | 'volleyball'
interface Settings {
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  tdee: Record<DayType, number>
  weeklyPattern: Record<number, DayType>
  proteinTarget: number
}
interface Meal { id: number; date: string; kcal: number; protein: number }
interface WeightEntry { id: number; date: string; kg: number; excludeFromTrend: boolean }
interface TrainingBurn { id: number; date: string; kcal: number; note: string }
interface ExtraWorkout { id: number; date: string; kcal: number; note: string }
interface SpecialEvent {
  id: number; date: string; name: string
  excessKcal: number; bufferDays: number
  bufferDirection: 'before' | 'after' | 'both'
}
interface DailyAdjustment { id: number; date: string; kcal: number; note: string }

interface AllData {
  settings: Settings | null
  meals: Meal[]
  weights: WeightEntry[]
  burns: TrainingBurn[]
  events: SpecialEvent[]
  extras: ExtraWorkout[]
  adjustments: DailyAdjustment[]
}

// ── Data fetching ───────────────────────────────────────────────
async function loadAll(): Promise<AllData> {
  const [s, m, w, b, ev, ex, ad] = await Promise.all([
    supabase.from('settings').select('data').eq('user_id', USER_ID).maybeSingle(),
    supabase.from('meals').select('*').eq('user_id', USER_ID),
    supabase.from('weight_entries').select('*').eq('user_id', USER_ID),
    supabase.from('training_burns').select('*').eq('user_id', USER_ID),
    supabase.from('special_events').select('*').eq('user_id', USER_ID),
    supabase.from('extra_workouts').select('*').eq('user_id', USER_ID),
    supabase.from('daily_adjustments').select('*').eq('user_id', USER_ID),
  ])
  type R = Record<string, unknown>
  const num = (v: unknown) => Number(v)
  return {
    settings: (s.data?.data as Settings | undefined) ?? null,
    meals: (m.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string,
      kcal: num(r.kcal), protein: num(r.protein),
    })),
    weights: (w.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string,
      kg: num(r.kg), excludeFromTrend: r.exclude_from_trend as boolean,
    })),
    burns: (b.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string,
      kcal: num(r.kcal), note: r.note as string,
    })),
    events: (ev.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string, name: r.name as string,
      excessKcal: num(r.excess_kcal),
      bufferDays: r.buffer_days as number,
      bufferDirection: r.buffer_direction as 'before' | 'after' | 'both',
    })),
    extras: (ex.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string,
      kcal: num(r.kcal), note: r.note as string,
    })),
    adjustments: (ad.data ?? []).map((r: R) => ({
      id: r.id as number, date: r.date as string,
      kcal: num(r.kcal), note: r.note as string,
    })),
  }
}

// ── Compute (mirror src/lib/compute.ts) ────────────────────────
interface DayBudget {
  date: string; dow: number; dayType: DayType
  baseTdee: number; budget: number; effectiveBudget: number
  preBufferReduction: number; extraKcal: number; burnKcal: number
  consumed: number; protein: number
  remaining: number; isOver: boolean
  events: SpecialEvent[]
  adjustment: DailyAdjustment | null
  dailyDeficitBase: number
  actualDeficit: number | null  // null when no logged consumption
}

function computeDay(date: string, data: AllData): DayBudget | null {
  const { settings } = data
  if (!settings) return null

  const total = daysBetween(settings.startDate, settings.endDate) + 1
  const weightLossKg = settings.startWeight - settings.targetWeight
  const totalDeficitTarget = weightLossKg * 7700
  const dailyDeficitBase = totalDeficitTarget / total

  const dow = getWeekdayNum(date)
  const dayType: DayType = settings.weeklyPattern[dow] ?? 'rest'
  const baseTdee = settings.tdee[dayType] ?? settings.tdee.rest

  const eventsOnDay = data.events.filter((e) => e.date === date)
  const eventExcessKcal = eventsOnDay.reduce((s, e) => s + e.excessKcal, 0)

  let preBufferReduction = 0
  data.events.forEach((e) => {
    if (!e.bufferDays || e.bufferDays < 1) return
    const direction = e.bufferDirection ?? 'before'
    const diff = daysBetween(date, e.date)
    if (direction === 'before' && diff > 0 && diff <= e.bufferDays) {
      preBufferReduction += Math.round(e.excessKcal / e.bufferDays)
    } else if (direction === 'after' && diff < 0 && Math.abs(diff) <= e.bufferDays) {
      preBufferReduction += Math.round(e.excessKcal / e.bufferDays)
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

  const extraKcal = data.extras
    .filter((x) => x.date === date)
    .reduce((s, x) => s + x.kcal, 0)
  const burnKcal = data.burns
    .filter((b) => b.date === date)
    .reduce((s, b) => s + b.kcal, 0)
  const adjustment = data.adjustments.find((a) => a.date === date) ?? null
  const adjKcal = adjustment?.kcal ?? 0

  // Multiple events on the same day all stack into the budget.
  const budget =
    eventsOnDay.length > 0
      ? baseTdee - dailyDeficitBase + eventExcessKcal - preBufferReduction + extraKcal + adjKcal
      : baseTdee - dailyDeficitBase - preBufferReduction + extraKcal + adjKcal

  const dayMeals = data.meals.filter((m) => m.date === date)
  const consumed = dayMeals.reduce((s, m) => s + m.kcal, 0)
  const protein = dayMeals.reduce((s, m) => s + m.protein, 0)

  const effectiveBudget = Math.round(budget) + burnKcal
  const remaining = effectiveBudget - consumed

  const hasLog = consumed > 0 || burnKcal > 0
  const actualDeficit = hasLog ? baseTdee + extraKcal + burnKcal - consumed : null

  return {
    date, dow, dayType, baseTdee,
    budget: Math.round(budget), effectiveBudget,
    preBufferReduction, extraKcal, burnKcal,
    consumed, protein,
    remaining, isOver: remaining < 0,
    events: eventsOnDay, adjustment,
    dailyDeficitBase: Math.round(dailyDeficitBase),
    actualDeficit,
  }
}

// ── Weight trend (mirror src/lib/weight.ts simplified) ─────────
function computeTrend(weights: WeightEntry[]) {
  const usable = weights
    .filter((w) => !w.excludeFromTrend)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (usable.length === 0) return { entries: [], currentTrend: null, weeklyChange: null }

  // 7-day moving average centered on each entry, expanding window at start
  const trendData = usable.map((w, i) => {
    const windowStart = Math.max(0, i - 6)
    const window = usable.slice(windowStart, i + 1)
    const avg = window.reduce((s, x) => s + x.kg, 0) / window.length
    return { date: w.date, kg: w.kg, trend: avg, windowSize: window.length }
  })

  const last = trendData[trendData.length - 1]
  // Weekly change: slope between the trend value ~14 calendar days ago and
  // the current trend value. Same algorithm as src/lib/weight.ts so the UI
  // and the MCP report identical numbers.
  let weeklyChange: number | null = null
  if (trendData.length >= 3) {
    const targetDate = addDays(last.date, -14)
    const baseline = trendData.find((t) => t.date >= targetDate) ?? trendData[0]
    const days = daysBetween(baseline.date, last.date)
    if (days >= 3) {
      weeklyChange = ((last.trend - baseline.trend) / days) * 7
    }
  }
  return { entries: trendData, currentTrend: last.trend, weeklyChange }
}

// ── Tool implementations ──────────────────────────────────────
async function getTodayStatus() {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  return computeDay(toISO(new Date()), data) ?? { error: 'Could not compute today.' }
}

async function getDayStatus(args: { date: string }) {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  return computeDay(args.date, data) ?? { error: 'Could not compute the requested day.' }
}

async function getRecentMeals(args: { days?: number }) {
  const data = await loadAll()
  const days = Math.max(1, Math.min(60, args.days ?? 7))
  const cutoff = addDays(toISO(new Date()), -days + 1)
  return data.meals
    .filter((m) => m.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
}

async function getWeekSummary(args: { weeks?: number }) {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  const weeks = Math.max(1, Math.min(8, args.weeks ?? 1))
  const days = weeks * 7
  const today = toISO(new Date())
  const start = addDays(today, -days + 1)

  const summaries = []
  let totalConsumed = 0
  let totalBurn = 0
  let totalDeficit = 0
  let daysOver = 0
  let daysLogged = 0

  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    const day = computeDay(d, data)
    if (!day) continue
    const logged = day.consumed > 0 || day.burnKcal > 0
    if (logged) {
      daysLogged++
      totalConsumed += day.consumed
      totalBurn += day.burnKcal
      totalDeficit += day.actualDeficit ?? 0
      if (day.isOver) daysOver++
    }
    summaries.push({
      date: d,
      dayType: day.dayType,
      consumed: day.consumed,
      burnKcal: day.burnKcal,
      effectiveBudget: day.effectiveBudget,
      remaining: day.remaining,
      isOver: day.isOver,
      actualDeficit: day.actualDeficit,
      logged,
    })
  }

  return {
    rangeStart: start,
    rangeEnd: today,
    daysLogged,
    daysOver,
    totalConsumed,
    totalBurn,
    totalDeficit,
    avgConsumedPerLoggedDay: daysLogged ? Math.round(totalConsumed / daysLogged) : 0,
    avgDeficitPerLoggedDay: daysLogged ? Math.round(totalDeficit / daysLogged) : 0,
    days: summaries,
  }
}

async function getCumulativeDeficitStatus() {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  const { settings } = data

  const today = toISO(new Date())
  const totalDays = daysBetween(settings.startDate, settings.endDate)
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(settings.startDate, today)))
  const daysLeft = Math.max(0, totalDays - elapsed)

  // Cumulative deficit (mirror logic in src/lib/compute.ts cumulativeDeficit)
  let actualCum = 0
  for (let i = 0; i <= elapsed; i++) {
    const d = addDays(settings.startDate, i)
    const day = computeDay(d, data)
    if (day?.actualDeficit !== null && day !== null && d <= today) {
      actualCum += day.actualDeficit ?? 0
    }
  }

  const total = daysBetween(settings.startDate, settings.endDate) + 1
  const totalDeficitTarget = (settings.startWeight - settings.targetWeight) * 7700
  const dailyDeficitBase = totalDeficitTarget / total
  const expectedCum = dailyDeficitBase * elapsed
  const gap = expectedCum - actualCum
  const gapPerDay = elapsed > 0 ? gap / elapsed : 0
  const remainingTotal = totalDeficitTarget - actualCum

  let pace: 'on-track' | 'tighten-slightly' | 'tighten-significantly' | 'loosen'
  if (Math.abs(gapPerDay) <= 100) pace = 'on-track'
  else if (gapPerDay < -100) pace = 'loosen'
  else if (gapPerDay <= 300) pace = 'tighten-slightly'
  else pace = 'tighten-significantly'

  return {
    elapsedDays: elapsed,
    daysLeft,
    totalDays,
    actualCumulativeDeficit: Math.round(actualCum),
    expectedCumulativeDeficit: Math.round(expectedCum),
    targetTotalDeficit: Math.round(totalDeficitTarget),
    dailyDeficitBase: Math.round(dailyDeficitBase),
    gap: Math.round(gap),
    gapPerDay: Math.round(gapPerDay),
    remainingTotalDeficit: Math.round(remainingTotal),
    pace,
  }
}

async function getWeightTrend(args: { days?: number }) {
  const data = await loadAll()
  const days = Math.max(7, Math.min(180, args.days ?? 60))
  const cutoff = addDays(toISO(new Date()), -days + 1)
  const filtered = data.weights.filter((w) => w.date >= cutoff)
  const { entries, currentTrend, weeklyChange } = computeTrend(filtered)
  return {
    rangeStart: cutoff,
    rangeEnd: toISO(new Date()),
    entries,
    currentTrend,
    weeklyChange,
    weeklyChangeKgPerWk: weeklyChange,
    impliedDailyDeficitKcal: weeklyChange !== null ? Math.round((-weeklyChange * 7700) / 7) : null,
  }
}

async function getGoalAnalysis() {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  const { settings } = data

  const today = toISO(new Date())
  const totalDays = daysBetween(settings.startDate, settings.endDate)
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(settings.startDate, today)))
  const remainingDays = Math.max(0, totalDays - elapsed)
  if (remainingDays <= 0) return { error: 'Cut period is in the past.' }

  const trend = computeTrend(data.weights)
  if (trend.currentTrend === null) {
    return { error: 'Not enough weight log data for analysis.' }
  }

  // Position-based primary metric: current trend kg vs the linear target line at today.
  const totalKgChange = settings.startWeight - settings.targetWeight
  const expectedWeightToday =
    totalDays > 0 ? settings.startWeight - totalKgChange * (elapsed / totalDays) : settings.startWeight
  const positionGap = trend.currentTrend - expectedWeightToday   // + = above line (behind)

  const remainingKg = Math.max(0, trend.currentTrend - settings.targetWeight)
  const requiredDailyDeficit = (remainingKg * 7700) / remainingDays
  const requiredWeeklyKg = (requiredDailyDeficit * 7) / 7700
  const actualDailyDeficit = trend.weeklyChange !== null ? (-trend.weeklyChange * 7700) / 7 : null
  const actualWeeklyKg = trend.weeklyChange

  let projectedDate: string | null = null
  if (trend.weeklyChange !== null && trend.weeklyChange < -0.01) {
    const weeksNeeded = remainingKg / Math.abs(trend.weeklyChange)
    projectedDate = addDays(today, Math.round(weeksNeeded * 7))
  }

  // Match the UI's position-based thresholds (kg).
  let recommendation: 'on-track' | 'tighten-slightly' | 'tighten-significantly' | 'loosen'
  if (Math.abs(positionGap) <= 0.3) recommendation = 'on-track'
  else if (positionGap < -0.3) recommendation = 'loosen'
  else if (positionGap <= 1.0) recommendation = 'tighten-slightly'
  else recommendation = 'tighten-significantly'

  return {
    elapsedDays: elapsed,
    remainingDays,
    totalDays,
    currentTrendKg: Number(trend.currentTrend.toFixed(2)),
    expectedWeightTodayKg: Number(expectedWeightToday.toFixed(2)),
    positionGapKg: Number(positionGap.toFixed(2)),
    targetWeightKg: settings.targetWeight,
    remainingKg: Number(remainingKg.toFixed(2)),
    requiredDailyDeficit: Math.round(requiredDailyDeficit),
    requiredWeeklyKg: Number(requiredWeeklyKg.toFixed(2)),
    actualDailyDeficit: actualDailyDeficit !== null ? Math.round(actualDailyDeficit) : null,
    actualWeeklyKg: actualWeeklyKg !== null ? Number(actualWeeklyKg.toFixed(2)) : null,
    projectedGoalDate: projectedDate,
    targetGoalDate: settings.endDate,
    recommendation,
  }
}

async function listOverBudgetDays(args: { days?: number }) {
  const data = await loadAll()
  if (!data.settings) return { error: 'No settings configured.' }
  const days = Math.max(7, Math.min(60, args.days ?? 30))
  const today = toISO(new Date())
  const start = addDays(today, -days + 1)

  const over = []
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    const day = computeDay(d, data)
    if (day && day.isOver) {
      over.push({
        date: d,
        consumed: day.consumed,
        effectiveBudget: day.effectiveBudget,
        excess: -day.remaining,
        dayType: day.dayType,
        eventNames: day.events.map((e) => e.name),
      })
    }
  }
  return { rangeStart: start, rangeEnd: today, daysScanned: days, over }
}

async function getHabitsToday() {
  const today = toISO(new Date())
  const [habitsRes, entriesRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', USER_ID).eq('is_archived', false),
    supabase.from('habit_entries').select('*').eq('user_id', USER_ID),
  ])
  type Row = Record<string, unknown>
  const habits = (habitsRes.data ?? []) as Row[]
  const entries = (entriesRes.data ?? []) as Row[]

  // Mon=1 .. Sun=0 — week start = Monday
  const dow = getWeekdayNum(today)
  const offset = dow === 0 ? -6 : 1 - dow
  const weekStart = addDays(today, offset)

  return habits.map((h) => {
    const goalPeriod = (h.goal_period as string) === 'week' ? 'week' : 'day'
    const value =
      goalPeriod === 'week'
        ? entries
            .filter(
              (e) =>
                (e.habit_id as number) === h.id &&
                (e.entry_date as string) >= weekStart &&
                (e.entry_date as string) <= today,
            )
            .reduce((s, e) => s + Number(e.value), 0)
        : entries
            .filter(
              (e) =>
                (e.habit_id as number) === h.id && (e.entry_date as string) === today,
            )
            .reduce((s, e) => s + Number(e.value), 0)
    const goal = Number(h.goal_value)
    return {
      id: h.id,
      name: h.name,
      color: h.color,
      goalPeriod,
      goalUnit: (h.goal_unit as string) === 'binary' ? 'binary' : 'count',
      goalValue: goal,
      currentValue: value,
      reached: goal > 0 && value >= goal,
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// OHJELMOINTI — treenipohjat, blokit, lämpöt, paikat
//
// Tämä puoli on sekä luettava että kirjoitettava, ja siinä on koko ero
// edelliseen: keskustelu ohjelmasta muuttuu ohjelmaksi vasta kun se kirjoittuu
// kantaan. Kolme sääntöä pitävät sen turvallisena.
//
// 1. Kirjoitus on aina kaksivaiheinen. Ensimmäinen kutsu ei kirjoita mitään
//    vaan palauttaa erot ja vahvistustunnuksen. Tunnus on tiiviste siitä mikä
//    rivi kannassa nyt on JA mitä sinne oltiin laittamassa, joten sillä ei voi
//    vahvistaa eri sisältöä kuin mikä näytettiin — eikä vanhentunutta:
//    jos rivi ehti muuttua välissä, tunnus ei enää täsmää ja kierros alkaa
//    alusta. Optimistinen lukitus tulee siis samasta mekanismista ilmaiseksi.
//
// 2. Muuttumaton kirjoitus ei ole kirjoitus. Jos uusi olio on identtinen
//    nykyisen kanssa, mitään ei kirjoiteta — sama idempotenssisääntö kuin
//    sisältömigraatioissa, ja se pitää `updated_at`in merkitsevänä.
//
// 3. Jokaisesta kirjoituksesta jää lokirivi jossa on koko edellinen versio,
//    joten peruutus on aina olemassa (`undo_write`).
//
// Mitä tämä EI tee: ei portteja, ei ratkaisulogiikkaa, ei annoslaskentaa.
// Ne ovat sovelluksen koodissa (lib/gates.ts, lib/sessionResolve.ts), ja
// toinen toteutus täällä olisi toinen totuus. Tämä lukee ja kirjoittaa
// sisältöä ja tarkistaa sen muodon.
// ═══════════════════════════════════════════════════════════════

const CAPABILITIES = ['externalLoad', 'muscleUpBar', 'plyoBox', 'anchorAndBand', 'parallettes', 'trapBar']
const BODY_REGIONS = ['knee', 'back', 'wrist']
const GATE_VARIANTS = ['develop', 'hybrid', 'treat', 'rest']
const BLOCK_INTENTS = ['base', 'strength', 'skill', 'peak', 'deload', 'other']

type Json = Record<string, unknown>

// ── Muodon tarkistus ───────────────────────────────────────────
// Kanta ottaa vastaan minkä tahansa jsonb:n, joten väärä muoto ei kaadu
// kirjoitettaessa vaan vasta puhelimessa — ja silloin se näyttää sovelluksen
// bugilta eikä siltä mitä se on. Siksi muoto tarkistetaan täällä.

function isPlain(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkPrescription(p: unknown, where: string, errs: string[]): void {
  if (!isPlain(p)) { errs.push(`${where}: pitää olla olio`); return }
  if (typeof p.name !== 'string' || !p.name.trim()) errs.push(`${where}.name puuttuu`)
  if (typeof p.sets !== 'number' || !Number.isInteger(p.sets) || p.sets < 1) {
    errs.push(`${where}.sets pitää olla kokonaisluku ≥ 1`)
  }
  if (p.reps !== undefined) {
    if (typeof p.reps === 'number') {
      if (p.reps < 1) errs.push(`${where}.reps ≥ 1`)
    } else if (isPlain(p.reps)) {
      const { min, max } = p.reps as { min?: unknown; max?: unknown }
      if (typeof min !== 'number' || typeof max !== 'number') errs.push(`${where}.reps pitää olla luku tai {min,max}`)
      else if (min > max) errs.push(`${where}.reps.min > max`)
    } else errs.push(`${where}.reps pitää olla luku tai {min,max}`)
  }
  if (p.holdSeconds !== undefined && (typeof p.holdSeconds !== 'number' || p.holdSeconds <= 0)) {
    errs.push(`${where}.holdSeconds pitää olla > 0`)
  }
  for (const k of ['tempo', 'note', 'placeLabel']) {
    if (p[k] !== undefined && typeof p[k] !== 'string') errs.push(`${where}.${k} pitää olla teksti`)
  }
  if (p.env !== undefined) checkEnv(p.env, `${where}.env`, errs)
  if (p.envOptions !== undefined) checkEnvOptions(p.envOptions, `${where}.envOptions`, errs)
}

function checkRequires(v: unknown, where: string, errs: string[]): void {
  if (!Array.isArray(v) || v.length === 0) { errs.push(`${where}.requires pitää olla ei-tyhjä lista`); return }
  for (const c of v) {
    if (typeof c !== 'string' || !CAPABILITIES.includes(c)) {
      errs.push(`${where}.requires: tuntematon kyky "${String(c)}" (sallitut: ${CAPABILITIES.join(', ')})`)
    }
  }
}

function checkEnv(v: unknown, where: string, errs: string[]): void {
  if (!isPlain(v)) { errs.push(`${where}: pitää olla olio`); return }
  checkRequires(v.requires, where, errs)
  if (v.fallback !== null && v.fallback !== undefined) checkPrescription(v.fallback, `${where}.fallback`, errs)
  else if (v.fallback === undefined) errs.push(`${where}.fallback puuttuu (null = liikettä ei tehdä täällä)`)
}

function checkEnvOptions(v: unknown, where: string, errs: string[]): void {
  if (!isPlain(v)) { errs.push(`${where}: pitää olla olio`); return }
  checkRequires(v.requires, where, errs)
  if (!Array.isArray(v.options) || v.options.length < 2) {
    errs.push(`${where}.options: vähintään kaksi vaihtoehtoa, muuten käytä env-kenttää`)
  } else {
    v.options.forEach((o, i) => {
      checkPrescription(o, `${where}.options[${i}]`, errs)
      if (isPlain(o) && typeof o.placeLabel !== 'string') {
        errs.push(`${where}.options[${i}].placeLabel puuttuu — rinnakkaisen vaihtoehdon koko pointti on kertoa missä se tehdään`)
      }
    })
  }
  if (v.fallback !== null && v.fallback !== undefined) checkPrescription(v.fallback, `${where}.fallback`, errs)
  else if (v.fallback === undefined) errs.push(`${where}.fallback puuttuu`)
}

function checkTemplateExercise(e: unknown, i: number, seen: Set<string>, errs: string[]): void {
  const where = `exercises[${i}]`
  if (!isPlain(e)) { errs.push(`${where}: pitää olla olio`); return }
  if (typeof e.id !== 'string' || !e.id.trim()) errs.push(`${where}.id puuttuu`)
  else if (seen.has(e.id)) errs.push(`${where}.id "${e.id}" on jo käytössä — id on se millä ohjelma tunnistaa slotin, eikä se saa toistua`)
  else seen.add(e.id)
  if (typeof e.name !== 'string' || !e.name.trim()) errs.push(`${where}.name puuttuu`)
  if (typeof e.defaultSets !== 'number' || !Number.isInteger(e.defaultSets) || e.defaultSets < 1) {
    errs.push(`${where}.defaultSets pitää olla kokonaisluku ≥ 1`)
  }
  if (e.repRange !== undefined) {
    const r = e.repRange as { min?: unknown; max?: unknown }
    if (!isPlain(e.repRange) || typeof r.min !== 'number' || typeof r.max !== 'number') {
      errs.push(`${where}.repRange pitää olla {min,max}`)
    } else if (r.min > r.max) errs.push(`${where}.repRange.min > max`)
  }
  if (e.interval !== undefined) {
    const iv = e.interval as Json
    if (!isPlain(iv)) errs.push(`${where}.interval pitää olla olio`)
    else {
      if (typeof iv.workSeconds !== 'number' || iv.workSeconds <= 0) errs.push(`${where}.interval.workSeconds > 0`)
      if (typeof iv.restSeconds !== 'number' || iv.restSeconds < 0) errs.push(`${where}.interval.restSeconds ≥ 0`)
      if (typeof iv.rounds !== 'number' || iv.rounds < 1) errs.push(`${where}.interval.rounds ≥ 1`)
      if (typeof iv.perSide !== 'boolean') errs.push(`${where}.interval.perSide pitää olla true/false`)
    }
  }
  if (e.env !== undefined) checkEnv(e.env, `${where}.env`, errs)
  if (e.envOptions !== undefined) checkEnvOptions(e.envOptions, `${where}.envOptions`, errs)
  if (e.gate !== undefined) {
    const g = e.gate as Json
    if (!isPlain(g)) { errs.push(`${where}.gate pitää olla olio`); return }
    if (typeof g.bodyRegion !== 'string' || !BODY_REGIONS.includes(g.bodyRegion)) {
      errs.push(`${where}.gate.bodyRegion pitää olla ${BODY_REGIONS.join(' | ')}`)
    }
    if (!isPlain(g.variants)) { errs.push(`${where}.gate.variants puuttuu`); return }
    const vs = g.variants as Json
    if (vs.develop === undefined || vs.develop === null) {
      errs.push(`${where}.gate.variants.develop on pakollinen — portilla on oltava jokin mitä kohti kehitetään`)
    } else checkPrescription(vs.develop, `${where}.gate.variants.develop`, errs)
    for (const k of ['hybrid', 'treat', 'rest']) {
      if (vs[k] !== undefined && vs[k] !== null) checkPrescription(vs[k], `${where}.gate.variants.${k}`, errs)
    }
    for (const k of Object.keys(vs)) {
      if (!GATE_VARIANTS.includes(k)) errs.push(`${where}.gate.variants.${k}: tuntematon tila`)
    }
  }
}

export function validateTemplate(t: unknown, knownWarmupIds: string[]): string[] {
  const errs: string[] = []
  if (!isPlain(t)) return ['template pitää olla olio']
  if (typeof t.id !== 'string' || !t.id.trim()) errs.push('id puuttuu')
  if (typeof t.name !== 'string' || !t.name.trim()) errs.push('name puuttuu')
  if (t.kind !== undefined && t.kind !== 'strength' && t.kind !== 'mobility') {
    errs.push('kind pitää olla "strength" tai "mobility"')
  }
  if (t.color !== undefined && t.color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(t.color))) {
    errs.push('color pitää olla #rrggbb')
  }
  if (t.warmupId !== undefined && t.warmupId !== null) {
    if (!knownWarmupIds.includes(String(t.warmupId))) {
      errs.push(`warmupId "${String(t.warmupId)}" ei vastaa mitään lämpöpakettia (tunnetut: ${knownWarmupIds.join(', ') || 'ei yhtään'})`)
    }
  }
  if (!Array.isArray(t.exercises)) errs.push('exercises pitää olla lista')
  else {
    const seen = new Set<string>()
    t.exercises.forEach((e, i) => checkTemplateExercise(e, i, seen, errs))
  }
  return errs
}

export function validateBlock(b: unknown): string[] {
  const errs: string[] = []
  if (!isPlain(b)) return ['block pitää olla olio']
  if (typeof b.id !== 'string' || !b.id.trim()) errs.push('id puuttuu')
  if (typeof b.name !== 'string' || !b.name.trim()) errs.push('name puuttuu')
  const iso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!iso(b.startDate)) errs.push('startDate pitää olla YYYY-MM-DD')
  if (!iso(b.endDate)) errs.push('endDate pitää olla YYYY-MM-DD')
  if (iso(b.startDate) && iso(b.endDate) && String(b.endDate) < String(b.startDate)) {
    errs.push('endDate on ennen startDatea')
  }
  if (b.intent !== undefined && b.intent !== null && !BLOCK_INTENTS.includes(String(b.intent))) {
    errs.push(`intent pitää olla ${BLOCK_INTENTS.join(' | ')}`)
  }
  if (b.color !== undefined && b.color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(b.color))) {
    errs.push('color pitää olla #rrggbb')
  }
  return errs
}

export function validateWarmup(w: unknown): string[] {
  const errs: string[] = []
  if (!isPlain(w)) return ['warmup pitää olla olio']
  if (typeof w.id !== 'string' || !w.id.trim()) errs.push('id puuttuu')
  if (typeof w.name !== 'string' || !w.name.trim()) errs.push('name puuttuu')
  if (!Array.isArray(w.items) || w.items.length === 0) errs.push('items pitää olla ei-tyhjä lista')
  else {
    const seen = new Set<string>()
    w.items.forEach((it, i) => {
      if (!isPlain(it)) { errs.push(`items[${i}]: pitää olla olio`); return }
      if (typeof it.id !== 'string' || !it.id.trim()) errs.push(`items[${i}].id puuttuu`)
      else if (seen.has(it.id)) errs.push(`items[${i}].id "${it.id}" toistuu`)
      else seen.add(it.id)
      if (typeof it.name !== 'string' || !it.name.trim()) errs.push(`items[${i}].name puuttuu`)
      // Annos on tekstiä eikä lukuja: "10 × / puoli" ja "30 s" ovat molemmat
      // oikeita vastauksia eikä niitä kannata pakottaa samaan muottiin.
      if (typeof it.dose !== 'string' || !it.dose.trim()) errs.push(`items[${i}].dose puuttuu`)
      if (it.gateRegion !== undefined && !BODY_REGIONS.includes(String(it.gateRegion))) {
        errs.push(`items[${i}].gateRegion pitää olla ${BODY_REGIONS.join(' | ')}`)
      }
      if (it.escalated !== undefined && it.escalated !== null) {
        const esc = it.escalated as Json
        if (!isPlain(esc) || typeof esc.dose !== 'string') errs.push(`items[${i}].escalated.dose puuttuu`)
      }
    })
  }
  return errs
}

// ── Erot ───────────────────────────────────────────────────────
// Listat joissa on id:t sovitetaan id:n mukaan eikä indeksin: yhden liikkeen
// siirto listassa näyttäisi muuten siltä että kaikki muuttui, ja silloin
// vahvistusta ei voi lukea.

const MAX_DIFF_LINES = 120

function short(v: unknown): string {
  if (v === undefined) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 90 ? `${s.slice(0, 87)}…` : s
}

function hasIds(a: unknown[]): boolean {
  return a.length > 0 && a.every((x) => isPlain(x) && typeof x.id === 'string')
}

export function diff(before: unknown, after: unknown, path: string, out: string[]): void {
  if (out.length >= MAX_DIFF_LINES) return
  if (JSON.stringify(before) === JSON.stringify(after)) return

  if (Array.isArray(before) && Array.isArray(after) && hasIds(before) && hasIds(after)) {
    const bById = new Map(before.map((x) => [(x as Json).id as string, x]))
    const aById = new Map(after.map((x) => [(x as Json).id as string, x]))
    for (const [id, b] of bById) {
      if (!aById.has(id)) out.push(`− poistuu ${path}[${id}] (${short((b as Json).name)})`)
    }
    for (const [id, a] of aById) {
      if (!bById.has(id)) out.push(`+ uusi ${path}[${id}] (${short((a as Json).name)})`)
      else diff(bById.get(id), a, `${path}[${id}]`, out)
    }
    const bOrder = before.map((x) => (x as Json).id).join(',')
    const aOrder = after.map((x) => (x as Json).id).join(',')
    if (bOrder !== aOrder) out.push(`~ ${path}: järjestys muuttuu`)
    return
  }

  if (isPlain(before) && isPlain(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      diff(before[k], after[k], path ? `${path}.${k}` : k, out)
    }
    return
  }

  out.push(`~ ${path}: ${short(before)} → ${short(after)}`)
}

// ── Kirjoituksen vaiheistus ────────────────────────────────────

export function tokenFor(tool: string, id: string, before: unknown, after: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([tool, id, before ?? null, after]))
    .digest('hex')
    .slice(0, 16)
}

interface StageArgs {
  tool: string
  table: string
  id: string
  /** Mitä verrataan ja mitä vahvistustunnus sitoo. Aikaleimat kannattaa
   *  nollata täältä, muuten mikään ei koskaan ole muuttumaton. */
  before: unknown
  after: unknown
  /** Mitä lokiin kirjataan, jos se on eri kuin vertailtava. Peruutus
   *  kirjoittaa juuri tämän takaisin, joten sen on oltava kokonainen ja
   *  todellinen olio — vertailua varten siivottu versio palauttaisi kantaan
   *  jotain mitä siellä ei ole koskaan ollut. */
  logBefore?: unknown
  logAfter?: unknown
  confirm?: string
  errors: string[]
  apply: () => Promise<{ error: { message: string } | null }>
}

export async function stage(a: StageArgs): Promise<unknown> {
  if (a.errors.length > 0) {
    return { ok: false, wrote: false, errors: a.errors, hint: 'Korjaa virheet ja kutsu uudelleen. Mitään ei kirjoitettu.' }
  }
  if (JSON.stringify(a.before) === JSON.stringify(a.after)) {
    return { ok: true, wrote: false, unchanged: true, message: 'Sisältö on jo täsmälleen tämä — ei kirjoitettu mitään.' }
  }

  const token = tokenFor(a.tool, a.id, a.before, a.after)
  const changes: string[] = []
  if (a.before === null) changes.push(`+ uusi rivi ${a.table}[${a.id}]`)
  else diff(a.before, a.after, '', changes)

  if (a.confirm !== token) {
    return {
      ok: true,
      wrote: false,
      dryRun: true,
      target: `${a.table}[${a.id}]`,
      changes: changes.slice(0, MAX_DIFF_LINES),
      truncated: changes.length > MAX_DIFF_LINES,
      confirmToken: token,
      hint: a.confirm
        ? 'Vahvistustunnus ei täsmää. Joko argumentit muuttuivat tai rivi kannassa muuttui sillä välin — tässä on tuore ero ja tuore tunnus.'
        : `Näytä nämä erot käyttäjälle. Kirjoita vasta kun hän hyväksyy: sama kutsu ja confirm: "${token}".`,
    }
  }

  const { error } = await a.apply()
  if (error) return { ok: false, wrote: false, errors: [error.message] }

  const { data: logRow } = await supabase
    .from('mcp_writes')
    .insert({
      user_id: USER_ID,
      tool: a.tool,
      target_table: a.table,
      target_id: a.id,
      before: (a.logBefore !== undefined ? a.logBefore : a.before) ?? null,
      after: (a.logAfter !== undefined ? a.logAfter : a.after) ?? null,
    })
    .select('id')
    .maybeSingle()

  return {
    ok: true,
    wrote: true,
    target: `${a.table}[${a.id}]`,
    changes: changes.slice(0, MAX_DIFF_LINES),
    writeId: (logRow as { id?: number } | null)?.id ?? null,
    note: 'Kirjoitettu. Puhelin näkee muutoksen seuraavalla synkalla. Peruutus: undo_write tällä writeId:llä.',
  }
}

// ── Rivimuunnokset (peilaa src/lib/workouts.ts, blocks.ts, warmups.ts) ──

interface TemplateRow {
  id: string; name: string; kind: string | null; color: string | null
  position: number | null; exercises: unknown[]; note: string | null
  warmup_id: string | null; warmup_progressive: boolean | null
  archived_at: string | null; created_at: string; updated_at: string
}

const templateFromRow = (r: TemplateRow) => ({
  id: r.id,
  name: r.name,
  kind: r.kind === 'mobility' ? 'mobility' : 'strength',
  color: r.color ?? undefined,
  position: r.position ?? undefined,
  exercises: Array.isArray(r.exercises) ? r.exercises : [],
  note: r.note ?? undefined,
  warmupId: r.warmup_id ?? null,
  warmupProgressive: r.warmup_progressive === true,
  archivedAt: r.archived_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const templateToRow = (t: Json) => ({
  id: t.id as string,
  user_id: USER_ID,
  name: t.name as string,
  kind: (t.kind as string) ?? 'strength',
  color: (t.color as string) ?? null,
  position: (t.position as number) ?? null,
  exercises: t.exercises,
  note: (t.note as string) ?? null,
  warmup_id: (t.warmupId as string) ?? null,
  warmup_progressive: t.warmupProgressive === true,
  archived_at: (t.archivedAt as string) ?? null,
  created_at: t.createdAt as string,
  updated_at: t.updatedAt as string,
})

interface BlockRow {
  id: string; name: string; start_date: string; end_date: string
  color: string | null; note: string | null; intent: string | null
  created_at: string; updated_at: string
}

const blockFromRow = (r: BlockRow) => ({
  id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date,
  color: r.color ?? '#22d3ee', note: r.note ?? undefined,
  intent: r.intent ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
})

async function loadTemplates(): Promise<Json[]> {
  const { data } = await supabase.from('workout_templates').select('*').eq('user_id', USER_ID)
  return (data ?? []).map((r) => templateFromRow(r as TemplateRow) as unknown as Json)
}

async function loadWarmupIds(): Promise<string[]> {
  const { data } = await supabase.from('workout_warmups').select('id').eq('user_id', USER_ID)
  return (data ?? []).map((r) => (r as { id: string }).id)
}

const nowIso = () => new Date().toISOString()

/** The upsert keys on `id` alone, and the service role bypasses RLS — so an id
 *  that happens to belong to another account would be overwritten rather than
 *  rejected. Nothing in a normal conversation produces such an id, but "only
 *  reachable by mistake" is not a boundary. This is. */
async function foreignRow(table: string, id: string): Promise<string[]> {
  const { data } = await supabase.from(table).select('user_id').eq('id', id).maybeSingle()
  const owner = (data as { user_id?: string } | null)?.user_id
  if (owner && owner !== USER_ID) {
    return [`Id "${id}" on jo varattu toisella tilillä taulussa ${table}. Valitse toinen id.`]
  }
  return []
}

// ── Lukutyökalut ───────────────────────────────────────────────

function doseOf(e: Json): string {
  const reps = e.repRange as { min: number; max: number } | undefined
  const r = reps ? (reps.min === reps.max ? `${reps.min}` : `${reps.min}–${reps.max}`) : null
  const iv = e.interval as { workSeconds: number; restSeconds: number; rounds: number; perSide: boolean } | undefined
  if (iv) return `${iv.rounds} × ${iv.workSeconds}s / ${iv.restSeconds}s${iv.perSide ? ' per puoli' : ''}`
  if (e.defaultDuration) return `${e.defaultSets} × ${e.defaultDuration} s`
  return r ? `${e.defaultSets} × ${r}` : `${e.defaultSets} sarjaa`
}

async function listWorkoutTemplates(args: { includeArchived?: boolean }) {
  const all = await loadTemplates()
  const rows = all.filter((t) => args.includeArchived === true || !t.archivedAt)
  return rows
    .sort((a, b) => ((a.position as number) ?? 99) - ((b.position as number) ?? 99))
    .map((t) => ({
      id: t.id, name: t.name, kind: t.kind, color: t.color, position: t.position,
      warmupId: t.warmupId, warmupProgressive: t.warmupProgressive,
      archived: Boolean(t.archivedAt), note: t.note,
      updatedAt: t.updatedAt,
      exercises: (t.exercises as Json[]).map((e) => ({
        id: e.id,
        name: e.name,
        dose: doseOf(e),
        gated: e.gate ? (e.gate as Json).bodyRegion : undefined,
        needs: (e.env as Json | undefined)?.requires ?? (e.envOptions as Json | undefined)?.requires,
        hasOptions: Array.isArray((e.envOptions as Json | undefined)?.options),
      })),
    }))
}

async function getWorkoutTemplate(args: { id?: string; name?: string }) {
  const all = await loadTemplates()
  const t = args.id
    ? all.find((x) => x.id === args.id)
    : all.find((x) => String(x.name).toLowerCase().includes(String(args.name ?? '').toLowerCase()))
  if (!t) return { error: 'Pohjaa ei löytynyt.', known: all.map((x) => ({ id: x.id, name: x.name })) }
  return t
}

async function listTrainingLocations() {
  const { data } = await supabase.from('workout_locations').select('*').eq('user_id', USER_ID)
  type R = Record<string, unknown>
  return (data ?? [])
    .map((r: R) => ({
      id: r.id, name: r.name, position: r.position,
      capabilities: [
        r.has_external_load ? 'externalLoad' : null,
        r.can_muscle_up ? 'muscleUpBar' : null,
        r.has_plyo_box ? 'plyoBox' : null,
        r.has_anchor_and_band ? 'anchorAndBand' : null,
        r.has_parallettes ? 'parallettes' : null,
        r.has_trap_bar ? 'trapBar' : null,
      ].filter(Boolean),
    }))
    .sort((a, b) => ((a.position as number) ?? 99) - ((b.position as number) ?? 99))
}

async function listWarmupPackages() {
  const { data } = await supabase.from('workout_warmups').select('*').eq('user_id', USER_ID)
  type R = Record<string, unknown>
  return (data ?? []).map((r: R) => ({
    id: r.id, name: r.name, note: r.note, items: r.items, updatedAt: r.updated_at,
  }))
}

async function listTrainingBlocks() {
  const { data } = await supabase.from('workout_blocks').select('*').eq('user_id', USER_ID)
  const blocks = (data ?? []).map((r) => blockFromRow(r as BlockRow))
  blocks.sort((a, b) => a.startDate.localeCompare(b.startDate))
  const today = toISO(new Date())
  return {
    today,
    current: blocks.find((b) => today >= b.startDate && today <= b.endDate) ?? null,
    next: blocks.find((b) => b.startDate > today) ?? null,
    blocks,
  }
}

async function listRecentWorkouts(args: { days?: number }) {
  const days = Math.max(1, Math.min(180, args.days ?? 28))
  const since = addDays(toISO(new Date()), -days + 1)
  const { data } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('completed', true)
    .gte('date', since)
  type R = Record<string, unknown>
  const rows = (data ?? []) as R[]
  return {
    since,
    count: rows.length,
    workouts: rows
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((w) => ({
        id: w.id, date: w.date, name: w.name, templateId: w.template_id,
        locationId: w.location_id, warmupDone: w.warmup_done,
        exercises: ((w.exercises as Json[]) ?? []).map((e) => ({
          name: e.name,
          // Vain tehdyt sarjat: kuittaamaton sarja on suunnitelma, ei tulos,
          // ja sen laskeminen mukaan näyttäisi volyymia jota ei tehty.
          sets: ((e.sets as Json[]) ?? []).filter((s) => s.done === true).map((s) => ({
            reps: s.reps, weight: s.weight, duration: s.duration,
          })),
          variant: (e.resolution as Json | undefined)?.gateState,
          baseName: (e.resolution as Json | undefined)?.baseName,
          unavailable: (e.resolution as Json | undefined)?.unavailable,
        })),
      })),
  }
}

async function getExerciseHistory(args: { name: string; limit?: number }) {
  const limit = Math.max(1, Math.min(40, args.limit ?? 12))
  const { data } = await supabase
    .from('workouts')
    .select('date, name, exercises')
    .eq('user_id', USER_ID)
    .eq('completed', true)
  type R = Record<string, unknown>
  const needle = String(args.name ?? '').toLowerCase()
  const hits: unknown[] = []
  for (const w of ((data ?? []) as R[]).sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    for (const e of ((w.exercises as Json[]) ?? [])) {
      const nm = String(e.name ?? '').toLowerCase()
      const base = String((e.resolution as Json | undefined)?.baseName ?? '').toLowerCase()
      if (!nm.includes(needle) && !base.includes(needle)) continue
      const done = ((e.sets as Json[]) ?? []).filter((s) => s.done === true)
      if (done.length === 0) continue
      hits.push({
        date: w.date, session: w.name, name: e.name,
        variant: (e.resolution as Json | undefined)?.gateState,
        sets: done.map((s) => ({ reps: s.reps, weight: s.weight, duration: s.duration })),
        topWeight: Math.max(...done.map((s) => Number(s.weight ?? 0))) || null,
        totalReps: done.reduce((n, s) => n + Number(s.reps ?? 0), 0) || null,
      })
      if (hits.length >= limit) return { query: args.name, found: hits.length, sessions: hits }
    }
  }
  return { query: args.name, found: hits.length, sessions: hits }
}

// ── Kirjoitustyökalut ──────────────────────────────────────────

async function putWorkoutTemplate(args: { template?: Json; confirm?: string }) {
  const t = args.template
  if (!isPlain(t)) return { ok: false, errors: ['template puuttuu'] }
  const [all, warmupIds] = await Promise.all([loadTemplates(), loadWarmupIds()])
  const before = all.find((x) => x.id === t.id) ?? null

  const errors = [
    ...validateTemplate(t, warmupIds),
    ...(before ? [] : await foreignRow('workout_templates', String(t.id))),
  ]
  // Aikaleimat eivät tule kutsujalta: luontihetki säilyy ja muokkaushetki on
  // nyt. Jos ne olisivat argumentteja, ne olisi mahdollista kirjoittaa väärin
  // ja pohjien järjestys sekä synkka menisivät sen mukana.
  const after: Json = {
    ...t,
    kind: (t.kind as string) ?? 'strength',
    warmupId: t.warmupId ?? null,
    warmupProgressive: t.warmupProgressive === true,
    archivedAt: before ? (before.archivedAt ?? null) : null,
    createdAt: before ? before.createdAt : nowIso(),
    updatedAt: nowIso(),
  }
  // Vertailu ilman updatedAt:ia, muuten mikään ei koskaan olisi muuttumaton.
  const cmpBefore = before ? { ...before, updatedAt: '' } : null
  const cmpAfter = { ...after, updatedAt: '' }

  return stage({
    tool: 'put_workout_template',
    table: 'workout_templates',
    id: String(t.id),
    before: cmpBefore,
    after: cmpAfter,
    logBefore: before,
    logAfter: after,
    confirm: args.confirm,
    errors,
    apply: async () => supabase.from('workout_templates').upsert(templateToRow(after)),
  })
}

async function setTemplateArchived(args: { id?: string; archived?: boolean; confirm?: string }) {
  const all = await loadTemplates()
  const before = all.find((x) => x.id === args.id) ?? null
  if (!before) return { ok: false, errors: [`Pohjaa "${String(args.id)}" ei löytynyt.`] }
  const archived = args.archived !== false
  const after = { ...before, archivedAt: archived ? nowIso() : null, updatedAt: nowIso() }
  // Vertailu pelkästä tilasta: aikaleima eroaa aina, ja "arkistoitu → yhä
  // arkistoitu, eri kellonaika" ei ole muutos josta kannattaa kysyä.
  const cmpBefore = { name: before.name, archived: Boolean(before.archivedAt) }
  const cmpAfter = { name: before.name, archived }

  return stage({
    tool: 'set_template_archived',
    table: 'workout_templates',
    id: String(args.id),
    before: cmpBefore,
    after: cmpAfter,
    logBefore: before,
    logAfter: after,
    confirm: args.confirm,
    errors: [],
    apply: async () =>
      supabase.from('workout_templates')
        .update({ archived_at: after.archivedAt, updated_at: after.updatedAt })
        .eq('id', String(args.id)).eq('user_id', USER_ID),
  })
}

async function putTrainingBlock(args: { block?: Json; confirm?: string }) {
  const b = args.block
  if (!isPlain(b)) return { ok: false, errors: ['block puuttuu'] }
  const { data } = await supabase.from('workout_blocks').select('*').eq('user_id', USER_ID)
  const all = (data ?? []).map((r) => blockFromRow(r as BlockRow))
  const before = all.find((x) => x.id === b.id) ?? null

  const errors = [
    ...validateBlock(b),
    ...(before ? [] : await foreignRow('workout_blocks', String(b.id))),
  ]
  // Päällekkäisyys ei ole virhe vaan huomautus: kaksi blokkia voi mennä
  // limittäin siirtymäviikolla, mutta se on harvoin tahallista.
  const overlaps = all
    .filter((x) => x.id !== b.id && String(b.startDate) <= x.endDate && String(b.endDate) >= x.startDate)
    .map((x) => `${x.name} (${x.startDate}…${x.endDate})`)

  const after: Json = {
    ...b,
    color: (b.color as string) ?? '#22d3ee',
    createdAt: before ? before.createdAt : nowIso(),
    updatedAt: nowIso(),
  }
  const cmpBefore = before ? { ...before, updatedAt: '' } : null
  const cmpAfter = { ...after, updatedAt: '' }

  const res = await stage({
    tool: 'put_training_block',
    table: 'workout_blocks',
    id: String(b.id),
    before: cmpBefore,
    after: cmpAfter,
    logBefore: before,
    logAfter: after,
    confirm: args.confirm,
    errors,
    apply: async () => supabase.from('workout_blocks').upsert({
      id: b.id as string, user_id: USER_ID, name: b.name as string,
      start_date: b.startDate as string, end_date: b.endDate as string,
      color: after.color as string, note: (b.note as string) ?? null,
      intent: (b.intent as string) ?? null,
      created_at: after.createdAt as string, updated_at: after.updatedAt as string,
    }),
  })
  return overlaps.length > 0 ? { ...(res as Json), warning: `Menee päällekkäin: ${overlaps.join(', ')}` } : res
}

async function putWarmupPackage(args: { warmup?: Json; confirm?: string }) {
  const w = args.warmup
  if (!isPlain(w)) return { ok: false, errors: ['warmup puuttuu'] }
  const { data } = await supabase.from('workout_warmups').select('*').eq('user_id', USER_ID)
  type R = Record<string, unknown>
  const rows = (data ?? []) as R[]
  const row = rows.find((r) => r.id === w.id)
  const before = row ? { id: row.id, name: row.name, note: row.note ?? undefined, items: row.items } : null

  const errors = [
    ...validateWarmup(w),
    ...(before ? [] : await foreignRow('workout_warmups', String(w.id))),
  ]
  const after: Json = { id: w.id, name: w.name, note: w.note ?? undefined, items: w.items }

  return stage({
    tool: 'put_warmup_package',
    table: 'workout_warmups',
    id: String(w.id),
    before,
    after,
    confirm: args.confirm,
    errors,
    apply: async () => supabase.from('workout_warmups').upsert({
      id: w.id as string, user_id: USER_ID, name: w.name as string,
      items: w.items, note: (w.note as string) ?? null, updated_at: nowIso(),
    }),
  })
}

async function listWrites(args: { limit?: number }) {
  const limit = Math.max(1, Math.min(50, args.limit ?? 10))
  const { data } = await supabase
    .from('mcp_writes')
    .select('id, at, tool, target_table, target_id, undone_at')
    .eq('user_id', USER_ID)
    .order('at', { ascending: false })
    .limit(limit)
  return data ?? []
}

async function undoWrite(args: { writeId?: number; confirm?: string }) {
  const { data } = await supabase
    .from('mcp_writes').select('*').eq('user_id', USER_ID).eq('id', args.writeId ?? -1).maybeSingle()
  const row = data as Json | null
  if (!row) return { ok: false, errors: [`Kirjoitusta ${String(args.writeId)} ei löytynyt.`] }
  if (row.undone_at) return { ok: false, errors: ['Tämä kirjoitus on jo peruutettu.'] }

  const table = String(row.target_table)
  const id = String(row.target_id)
  const back = row.before as Json | null

  // Peruutus kirjoittaa takaisin koko edellisen olion. Jos riviä ei ollut
  // ennen kirjoitusta, peruutus on poisto — muuten tyhjästä luotu pohja jäisi
  // roikkumaan puolitiehen.
  const apply = async () => {
    if (!back) {
      return supabase.from(table).delete().eq('id', id).eq('user_id', USER_ID)
    }
    if (table === 'workout_templates') {
      return supabase.from(table).upsert(templateToRow({ ...back, updatedAt: nowIso() }))
    }
    if (table === 'workout_blocks') {
      return supabase.from(table).upsert({
        id, user_id: USER_ID, name: back.name as string,
        start_date: back.startDate as string, end_date: back.endDate as string,
        color: (back.color as string) ?? null, note: (back.note as string) ?? null,
        intent: (back.intent as string) ?? null,
        created_at: (back.createdAt as string) ?? nowIso(), updated_at: nowIso(),
      })
    }
    if (table === 'workout_warmups') {
      return supabase.from(table).upsert({
        id, user_id: USER_ID, name: back.name as string,
        items: back.items, note: (back.note as string) ?? null, updated_at: nowIso(),
      })
    }
    return { error: { message: `Taulun ${table} peruutusta ei ole toteutettu.` } }
  }

  const token = tokenFor('undo_write', String(args.writeId), row.after ?? null, back)
  if (args.confirm !== token) {
    const changes: string[] = []
    diff(row.after ?? null, back, '', changes)
    return {
      ok: true, wrote: false, dryRun: true,
      target: `${table}[${id}]`,
      undoing: { tool: row.tool, at: row.at },
      changes: changes.slice(0, MAX_DIFF_LINES),
      confirmToken: token,
      hint: `Peruutus palauttaa koko edellisen version. Vahvista: confirm: "${token}".`,
    }
  }

  const { error } = await apply()
  if (error) return { ok: false, wrote: false, errors: [error.message] }
  await supabase.from('mcp_writes').update({ undone_at: nowIso() }).eq('id', args.writeId ?? -1).eq('user_id', USER_ID)
  return { ok: true, wrote: true, target: `${table}[${id}]`, note: 'Peruutettu.' }
}

// ── Tool registry ──────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_today_status',
    description:
      "Today's full picture: date, day type, budget, training burns, consumed, protein, kcal remaining (positive = under budget, negative = over), and any active event/adjustment.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_day_status',
    description:
      "Same as get_today_status but for a specific date. Useful for inspecting past or future planned days.",
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'get_recent_meals',
    description: 'Recent meals from the last N days (default 7, max 60).',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'How many days back', default: 7 } },
    },
  },
  {
    name: 'get_week_summary',
    description:
      'Per-day breakdown and roll-up totals over the last N weeks (default 1, max 8). Returns days logged, days over budget, totals, and per-day rows.',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'number', description: 'How many weeks back', default: 1 } },
    },
  },
  {
    name: 'get_cumulative_deficit_status',
    description:
      'Current cumulative calorie deficit vs the expected linear ramp for the cut. Returns elapsed/remaining days, actual vs expected cumulative kcal, gap, and a pace classification.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_weight_trend',
    description:
      'Recent weight entries with 7-day moving-average trend and weekly change rate. Default 60-day window.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'How many days back', default: 60 } },
    },
  },
  {
    name: 'get_goal_analysis',
    description:
      'Full goal analysis equivalent to the Tavoite tab: required pace vs current pace (from weight trend), gap kcal/day, projected goal date, and recommendation.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_over_budget_days',
    description: 'Days in the last N days (default 30) where consumed > effective budget.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'How many days back', default: 30 } },
    },
  },
  {
    name: 'get_habits_today',
    description: "Each non-archived habit with today's (or current week's) value vs goal.",
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Ohjelmointi: luku ────────────────────────────────────────
  {
    name: 'list_workout_templates',
    description:
      'All workout templates (the programme) in display order: name, kind, colour, warm-up package, and for each slot its id, movement, dose, which body-region gate controls it and what equipment it needs. Start here before proposing any change to the programme.',
    inputSchema: {
      type: 'object',
      properties: { includeArchived: { type: 'boolean', description: 'Include retired templates too', default: false } },
    },
  },
  {
    name: 'get_workout_template',
    description:
      'One template in full, exactly as stored: every slot with its gate variants (develop/hybrid/treat/rest), environment requirements and fallbacks. This is the object to edit and hand back to put_workout_template.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Template id' },
        name: { type: 'string', description: 'Or a substring of the name' },
      },
    },
  },
  {
    name: 'list_training_locations',
    description:
      'Training places and what each one has (external load, muscle-up bar, plyo box, anchor+band, parallettes, trap bar). A slot may only require capabilities that some place actually offers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_warmup_packages',
    description: 'Warm-up packages with their items and doses. A template references one by warmupId.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_training_blocks',
    description: 'Training blocks with the one running today and the one coming next.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_recent_workouts',
    description:
      'Completed sessions from the last N days (default 28) with only the sets that were actually ticked off, plus which gate variant was done. This is what the programme should be judged against.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'How many days back', default: 28 } },
    },
  },
  {
    name: 'get_exercise_history',
    description:
      'How one movement has progressed across sessions: matched on the logged name or the template slot name, newest first, with top weight and total reps per session.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Movement name or part of it' },
        limit: { type: 'number', description: 'How many sessions', default: 12 },
      },
      required: ['name'],
    },
  },

  // ── Ohjelmointi: kirjoitus ───────────────────────────────────
  // Jokainen näistä on kaksivaiheinen. Kuvaus sanoo sen ääneen, koska malli
  // joka ei tiedä sitä kutsuu kerran, näkee "wrote: false" ja luulee
  // epäonnistuneensa.
  {
    name: 'put_workout_template',
    description:
      'Create or replace a whole workout template, matched by its stable id. TWO-STEP: the first call writes nothing — it validates, returns the exact changes and a confirmToken. Show those changes to the user, and only once they agree, call again with the identical template plus confirm: "<token>". Pass the whole object (fetch it with get_workout_template and edit it); omitted fields are dropped. Slot ids must stay stable — they are what links a logged session back to the slot it came from. createdAt/updatedAt/archivedAt are managed here, not by you.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'object', description: 'The full WorkoutTemplate object: id, name, kind, color, position, note, warmupId, warmupProgressive, exercises[]' },
        confirm: { type: 'string', description: 'The confirmToken from the dry run. Leave out on the first call.' },
      },
      required: ['template'],
    },
  },
  {
    name: 'set_template_archived',
    description:
      'Retire a template (or bring it back). Archiving keeps all history and only removes it from the pickers — prefer it over deleting. Two-step like every write.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        archived: { type: 'boolean', description: 'true = retire (default), false = restore' },
        confirm: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'put_training_block',
    description:
      'Create or replace a training block (id, name, startDate, endDate, intent, color, note). Warns if the dates overlap another block. Two-step like every write.',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'object', description: 'id, name, startDate, endDate (YYYY-MM-DD), intent (base|strength|skill|peak|deload|other), color, note' },
        confirm: { type: 'string' },
      },
      required: ['block'],
    },
  },
  {
    name: 'put_warmup_package',
    description:
      'Create or replace a warm-up package (id, name, note, items[] with id/name/dose/note/progressive/gateRegion/escalated). Two-step like every write.',
    inputSchema: {
      type: 'object',
      properties: {
        warmup: { type: 'object' },
        confirm: { type: 'string' },
      },
      required: ['warmup'],
    },
  },
  {
    name: 'list_writes',
    description: 'Recent writes made through this MCP, newest first, with the id needed to undo one.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
  },
  {
    name: 'undo_write',
    description:
      'Restore what a write replaced, by its writeId from list_writes. Puts back the whole previous object; if the write created the row, undoing deletes it. Two-step like every write.',
    inputSchema: {
      type: 'object',
      properties: {
        writeId: { type: 'number' },
        confirm: { type: 'string' },
      },
      required: ['writeId'],
    },
  },
]

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_today_status':
      return getTodayStatus()
    case 'get_day_status':
      return getDayStatus(args as { date: string })
    case 'get_recent_meals':
      return getRecentMeals(args as { days?: number })
    case 'get_week_summary':
      return getWeekSummary(args as { weeks?: number })
    case 'get_cumulative_deficit_status':
      return getCumulativeDeficitStatus()
    case 'get_weight_trend':
      return getWeightTrend(args as { days?: number })
    case 'get_goal_analysis':
      return getGoalAnalysis()
    case 'list_over_budget_days':
      return listOverBudgetDays(args as { days?: number })
    case 'get_habits_today':
      return getHabitsToday()

    case 'list_workout_templates':
      return listWorkoutTemplates(args as { includeArchived?: boolean })
    case 'get_workout_template':
      return getWorkoutTemplate(args as { id?: string; name?: string })
    case 'list_training_locations':
      return listTrainingLocations()
    case 'list_warmup_packages':
      return listWarmupPackages()
    case 'list_training_blocks':
      return listTrainingBlocks()
    case 'list_recent_workouts':
      return listRecentWorkouts(args as { days?: number })
    case 'get_exercise_history':
      return getExerciseHistory(args as { name: string; limit?: number })

    case 'put_workout_template':
      return putWorkoutTemplate(args as { template?: Json; confirm?: string })
    case 'set_template_archived':
      return setTemplateArchived(args as { id?: string; archived?: boolean; confirm?: string })
    case 'put_training_block':
      return putTrainingBlock(args as { block?: Json; confirm?: string })
    case 'put_warmup_package':
      return putWarmupPackage(args as { warmup?: Json; confirm?: string })
    case 'list_writes':
      return listWrites(args as { limit?: number })
    case 'undo_write':
      return undoWrite(args as { writeId?: number; confirm?: string })

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── JSON-RPC handler ───────────────────────────────────────────
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

function ok(id: number | string | undefined, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}
function err(id: number | string | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

interface VercelReq {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface VercelRes {
  status: (code: number) => VercelRes
  setHeader: (k: string, v: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export default async function handler(req: VercelReq, res: VercelRes) {
  // CORS for browser-based clients (Claude.ai connector calls server-side though)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: 'macro-tracker',
      version: '1.0.0',
      transport: 'http-streamable-json-rpc',
      tools: TOOLS.map((t) => t.name),
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Bearer auth
  const auth = String(req.headers.authorization ?? '')
  const provided = auth.replace(/^Bearer\s+/i, '')
  if (!API_KEY || provided !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!USER_ID || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'MCP server is missing required environment variables.' })
    return
  }

  const raw = req.body as JsonRpcRequest | JsonRpcRequest[] | undefined
  const messages = Array.isArray(raw) ? raw : raw ? [raw] : []
  const responses: unknown[] = []

  for (const msg of messages) {
    const { id, method, params } = msg
    try {
      switch (method) {
        case 'initialize':
          responses.push(
            ok(id, {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'macro-tracker', version: '1.0.0' },
              capabilities: { tools: { listChanged: false } },
            }),
          )
          break
        case 'notifications/initialized':
        case 'notifications/cancelled':
          // No response for notifications
          break
        case 'tools/list':
          responses.push(ok(id, { tools: TOOLS }))
          break
        case 'tools/call': {
          const name = String((params as Record<string, unknown>)?.name ?? '')
          const args = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>
          const result = await dispatch(name, args)
          responses.push(
            ok(id, {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }),
          )
          break
        }
        case 'ping':
          responses.push(ok(id, {}))
          break
        default:
          responses.push(err(id, -32601, `Method not found: ${method}`))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      responses.push(err(id, -32603, message))
    }
  }

  if (responses.length === 0) {
    res.status(204).end()
    return
  }
  res.status(200).json(Array.isArray(raw) ? responses : responses[0])
}
