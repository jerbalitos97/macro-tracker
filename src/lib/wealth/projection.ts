// Projection math + chart data assembly. Monthly compound:
//   value = value × (1 + annualReturn / 100 / 12)
//   value += monthlyContribution    // if dateIso ∈ [contributionStart, contributionEnd]

import type { Asset, AssetValue, ChartPoint } from './types'

const MS_PER_DAY = 86_400_000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return isoDate(d)
}

function findValueAt(history: AssetValue[], targetIso: string): number | null {
  let result: number | null = null
  for (const v of history) {
    if (v.recordedAt <= targetIso) result = v.value
    else break
  }
  return result
}

export function buildAssetTrajectory(args: {
  baseValue: number
  baseDateIso: string
  monthsAhead: number
  annualReturnPercent: number
  monthlyContribution?: number
  contributionStart?: string | null
  contributionEnd?: string | null
}): Map<string, number> {
  const {
    baseValue,
    baseDateIso,
    monthsAhead,
    annualReturnPercent,
    monthlyContribution = 0,
    contributionStart = null,
    contributionEnd = null,
  } = args
  const map = new Map<string, number>()
  const monthlyRate = annualReturnPercent / 100 / 12
  let value = baseValue
  for (let m = 1; m <= monthsAhead; m++) {
    const dateIso = addMonthsIso(baseDateIso, m)
    value = value * (1 + monthlyRate)
    if (
      monthlyContribution > 0 &&
      (!contributionStart || dateIso >= contributionStart) &&
      (!contributionEnd || dateIso <= contributionEnd)
    ) {
      value += monthlyContribution
    }
    map.set(dateIso, value)
  }
  return map
}

export type BuildChartArgs = {
  assets: Asset[]
  values: AssetValue[]
  showProjection: boolean
  projectionYears: number
}

export function buildChartData(args: BuildChartArgs): ChartPoint[] {
  const { assets, values, showProjection, projectionYears } = args
  if (assets.length === 0) return []

  const byAsset = new Map<string, AssetValue[]>()
  for (const a of assets) byAsset.set(a.id, [])
  for (const v of values) byAsset.get(v.assetId)?.push(v)
  for (const arr of byAsset.values()) {
    arr.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  }

  const today = isoDate(new Date())
  const monthsAhead =
    showProjection && projectionYears > 0 ? Math.max(1, Math.round(projectionYears * 12)) : 0

  const trajectories = new Map<string, Map<string, number>>()
  if (monthsAhead > 0) {
    for (const asset of assets) {
      const history = byAsset.get(asset.id) ?? []
      if (history.length === 0) continue
      const lastRec = history[history.length - 1]
      trajectories.set(
        asset.id,
        buildAssetTrajectory({
          baseValue: lastRec.value,
          baseDateIso: today,
          monthsAhead,
          annualReturnPercent: asset.estimatedAnnualReturn,
          monthlyContribution: asset.monthlyContribution,
          contributionStart: asset.contributionStart,
          contributionEnd: asset.contributionEnd,
        }),
      )
    }
  }

  const dateSet = new Set<string>()
  for (const v of values) dateSet.add(v.recordedAt)
  dateSet.add(today)
  for (let m = 1; m <= monthsAhead; m++) {
    dateSet.add(addMonthsIso(today, m))
  }
  const dates = [...dateSet].sort()
  const points: ChartPoint[] = []

  for (const date of dates) {
    const point: ChartPoint = { date, isProjection: false }
    let portfolio = 0
    let portfolioProjection = 0
    let historicalCount = 0
    let projectionCount = 0
    let activeAssetCount = 0

    for (const asset of assets) {
      const history = byAsset.get(asset.id) ?? []
      if (history.length === 0) continue
      const firstRec = history[0]
      if (date < firstRec.recordedAt) continue
      activeAssetCount++

      if (date <= today) {
        const v = findValueAt(history, date)
        if (v !== null) {
          point[`asset_${asset.id}`] = v
          portfolio += v
          historicalCount++
        }
      } else {
        const projected = trajectories.get(asset.id)?.get(date)
        if (projected !== undefined) {
          point[`projection_${asset.id}`] = projected
          portfolioProjection += projected
          projectionCount++
        }
      }
    }

    if (historicalCount === activeAssetCount && activeAssetCount > 0) {
      point.portfolio = portfolio
    }
    if (projectionCount === activeAssetCount && activeAssetCount > 0) {
      point.portfolioProjection = portfolioProjection
      point.isProjection = true
    }
    points.push(point)
  }
  return points
}

export function currentPortfolioValue(assets: Asset[], values: AssetValue[]): number {
  const byAsset = new Map<string, AssetValue[]>()
  for (const a of assets) byAsset.set(a.id, [])
  for (const v of values) byAsset.get(v.assetId)?.push(v)
  let total = 0
  for (const arr of byAsset.values()) {
    if (arr.length === 0) continue
    arr.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    total += arr[arr.length - 1].value
  }
  return total
}

export function currentAssetValue(assetId: string, values: AssetValue[]): number | null {
  const own = values
    .filter((v) => v.assetId === assetId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  if (own.length === 0) return null
  return own[own.length - 1].value
}

export function daysBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / MS_PER_DAY
}
