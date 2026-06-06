// Wealth feature domain types. Mirrors the wt_* Supabase tables.

export type Asset = {
  id: string
  name: string
  estimatedAnnualReturn: number
  monthlyContribution: number
  contributionStart: string | null
  contributionEnd: string | null
  createdAt: string
}

export type AssetValue = {
  id: string
  assetId: string
  value: number
  recordedAt: string
  createdAt: string
}

export type Settings = {
  wealthGoal: number | null
  currency: string
}

export type ChartPoint = {
  date: string
  isProjection: boolean
  portfolio?: number | null
  portfolioProjection?: number | null
} & Record<string, number | null | string | boolean | undefined>
