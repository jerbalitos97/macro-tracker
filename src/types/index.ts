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
  event: SpecialEvent | null
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
