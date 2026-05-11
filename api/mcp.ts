// MCP server for the Macrotracker app. Exposes high-level read tools so
// Claude.ai (or Claude Code) can answer questions about your data without
// needing to know the underlying DB schema.
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
  event: SpecialEvent | null
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

  const eventOnDay = data.events.find((e) => e.date === date) ?? null

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

  const budget = eventOnDay
    ? baseTdee - dailyDeficitBase + eventOnDay.excessKcal + adjKcal
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
    event: eventOnDay, adjustment,
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
  // Weekly change: slope over last ~14 days of trend points
  let weeklyChange: number | null = null
  if (trendData.length >= 7) {
    const recent = trendData.slice(-14)
    const days = daysBetween(recent[0].date, recent[recent.length - 1].date)
    if (days > 0) {
      const slope = (recent[recent.length - 1].trend - recent[0].trend) / days
      weeklyChange = slope * 7
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
  const remainingDays = daysBetween(today, settings.endDate)
  if (remainingDays <= 0) return { error: 'Cut period is in the past.' }

  const trend = computeTrend(data.weights)
  if (trend.currentTrend === null || trend.weeklyChange === null) {
    return { error: 'Not enough weight log data for analysis (need ≥ 7 logged days).' }
  }

  const remainingKg = Math.max(0, trend.currentTrend - settings.targetWeight)
  const requiredTotalDeficit = remainingKg * 7700
  const requiredDailyDeficit = requiredTotalDeficit / remainingDays
  const requiredWeeklyKg = (requiredDailyDeficit * 7) / 7700
  const actualDailyDeficit = (-trend.weeklyChange * 7700) / 7
  const actualWeeklyKg = trend.weeklyChange
  const gap = requiredDailyDeficit - actualDailyDeficit

  let projectedDate: string | null = null
  if (trend.weeklyChange < -0.01) {
    const weeksNeeded = remainingKg / Math.abs(trend.weeklyChange)
    projectedDate = addDays(today, Math.round(weeksNeeded * 7))
  }

  let recommendation: 'on-track' | 'tighten-slightly' | 'tighten-significantly' | 'loosen'
  if (Math.abs(gap) <= 100) recommendation = 'on-track'
  else if (gap < -100) recommendation = 'loosen'
  else if (gap <= 300) recommendation = 'tighten-slightly'
  else recommendation = 'tighten-significantly'

  return {
    elapsedDays: elapsed,
    remainingDays,
    totalDays,
    currentTrendKg: Number(trend.currentTrend.toFixed(2)),
    targetWeightKg: settings.targetWeight,
    remainingKg: Number(remainingKg.toFixed(2)),
    requiredDailyDeficit: Math.round(requiredDailyDeficit),
    requiredWeeklyKg: Number(requiredWeeklyKg.toFixed(2)),
    actualDailyDeficit: Math.round(actualDailyDeficit),
    actualWeeklyKg: Number(actualWeeklyKg.toFixed(2)),
    gapKcalPerDay: Math.round(gap),
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
        eventName: day.event?.name ?? null,
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
