export type DayType = 'rest' | 'single' | 'double' | 'volleyball'
export type BufferDirection = 'before' | 'after' | 'both'

export interface TdeeMap {
  rest: number
  single: number
  double: number
  volleyball: number
}

export interface Settings {
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  tdee: TdeeMap
  weeklyPattern: Record<number, DayType>
  proteinTarget: number
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
