export type DayType = 'rest' | 'single' | 'double' | 'volleyball'
export type BufferDirection = 'before' | 'after' | 'both'

export interface TdeeMap {
  rest: number
  single: number
  double: number
  volleyball: number
}

export type PeriodType = 'cut' | 'maintenance' | 'refill' | 'bulk'
export type PeriodStatus = 'active' | 'achieved' | 'retired'

/**
 * One tavoitejakso. Multiple periods chain end→end to form a step-shaped
 * goal history. Type drives the trend interpretation (`src/lib/trendStatus.ts`)
 * and how `compute.ts` derives the day's `dailyDeficitBase`.
 *
 * Legacy data without `goalPeriods` is handled by a shim in
 * `src/lib/goalPeriods.ts` that synthesises one 'cut' period from the
 * legacy startDate/endDate/startWeight/targetWeight fields.
 */
export interface GoalPeriod {
  id: number
  type: PeriodType
  status: PeriodStatus
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  /** Optional ±band around targetWeight (used by maintenance/refill UIs). */
  targetMin?: number
  targetMax?: number
  /** Refill: how many weeks the controlled rise window lasts. Default 3. */
  refillWindowWeeks?: number
  /** Refill: how much gain is expected in total across the window. Default ~1.5–2 kg. */
  expectedRefillKg?: number
  /** Free-form label shown in history. */
  label?: string
  createdAt: string
}

export interface Settings {
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  tdee: TdeeMap
  weeklyPattern: Record<number, DayType>
  proteinTarget: number
  /**
   * Goal history. When present, this is the source of truth and the legacy
   * startDate/endDate/startWeight/targetWeight fields are ignored. When
   * absent, the selectors in `src/lib/goalPeriods.ts` synthesise a single
   * 'cut' period from the legacy fields — old data keeps working untouched.
   */
  goalPeriods?: GoalPeriod[]
}

export interface SpecialEvent {
  id: number
  date: string
  name: string
  excessKcal: number
  bufferDays: number
  bufferDirection: BufferDirection
}

export interface ExtraWorkout {
  id: number
  date: string
  kcal: number
  note: string
}

export interface Meal {
  id: number
  date: string
  kcal: number
  protein: number
}

export interface WeightEntry {
  id: number
  date: string
  kg: number
  excludeFromTrend: boolean
}

/**
 * Training burn logged on the Today view.
 * Reduces net consumed for the day, improving the deficit.
 * Distinct from ExtraWorkout (which raises the day's budget).
 */
export interface TrainingBurn {
  id: number
  date: string
  kcal: number
  note: string
}

/**
 * Manual one-day budget adjustment. kcal is signed:
 *   positive → loosen the day (more food allowed)
 *   negative → tighten the day (less food allowed, more deficit)
 * Useful for applying a recovery plan from the goal view to specific days
 * without changing the global cut deficit.
 */
export interface DailyAdjustment {
  id: number
  date: string
  kcal: number
  note: string
}

export interface ComputedDay {
  date: string
  dow: number
  dayType: DayType
  baseTdee: number
  budget: number
  consumed: number
  protein: number
  preBufferReduction: number
  extraKcal: number
  burnKcal: number       // training burns on this day
  netConsumed: number    // consumed - burnKcal (≥ 0), used for deficit calc
  events: SpecialEvent[]
  adjustment: DailyAdjustment | null
  note: string
  dailyDeficitBase: number
  actualDeficit?: number
}

export interface ComputedResult {
  days: ComputedDay[]
  totalDays: number
  weightLossKg: number
  totalDeficitTarget: number
  dailyDeficitBase: number
  cumulativeDeficit: number
}

export interface AppData {
  settings: Settings
  events: SpecialEvent[]
  extras: ExtraWorkout[]
  meals: Meal[]
  weights: WeightEntry[]
  burns: TrainingBurn[]
  adjustments: DailyAdjustment[]
}

// ── Habits ──────────────────────────────────────────────────────
export type HabitGoalPeriod = 'day' | 'week'
export type HabitGoalUnit = 'count' | 'binary'
export type HabitType = 'build'

export interface Habit {
  id: number
  name: string
  description: string
  color: string
  habitType: HabitType
  goalPeriod: HabitGoalPeriod
  goalValue: number
  goalUnit: HabitGoalUnit
  taskDays: number[]    // 0=Sunday … 6=Saturday
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface HabitEntry {
  id: number
  habitId: number
  date: string          // YYYY-MM-DD
  value: number
}

export interface WeightTrend {
  trendData: Array<{ date: string; kg: number; trend: number; windowSize: number }>
  currentTrend: number | null
  weeklyChange: number | null
}

export type TdeeEvalResult =
  | {
      ready: false
      message: string
      daysCollected: number
    }
  | {
      ready: true
      weeklyChange: number
      assumedDailyDeficit: number
      trendImpliedDailyDeficit: number
      avgConsumed: number
      avgAssumedTdee: number
      realTdeeEstimate: number
      tdeeError: number
      significantError: boolean
      direction: 'lower' | 'higher'
      daysCollected: number
    }
