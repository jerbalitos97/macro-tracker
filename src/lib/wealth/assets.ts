// CRUD for wt_assets + wt_asset_values, reusing the host's supabase client.

import { supabase } from '../supabase'
import type { Asset, AssetValue } from './types'

function db() {
  if (!supabase) throw new Error('Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).')
  return supabase
}

type AssetRow = {
  id: string
  name: string
  estimated_annual_return: number | string
  monthly_contribution: number | string | null
  contribution_start: string | null
  contribution_end: string | null
  created_at: string
}

type ValueRow = {
  id: string
  asset_id: string
  value: number | string
  recorded_at: string
  created_at: string
}

function fromAssetRow(r: AssetRow): Asset {
  return {
    id: r.id,
    name: r.name,
    estimatedAnnualReturn: Number(r.estimated_annual_return),
    monthlyContribution: r.monthly_contribution === null ? 0 : Number(r.monthly_contribution),
    contributionStart: r.contribution_start,
    contributionEnd: r.contribution_end,
    createdAt: r.created_at,
  }
}

function fromValueRow(r: ValueRow): AssetValue {
  return {
    id: r.id,
    assetId: r.asset_id,
    value: Number(r.value),
    recordedAt: r.recorded_at,
    createdAt: r.created_at,
  }
}

export async function listAssets(): Promise<Asset[]> {
  const { data, error } = await db()
    .from('wt_assets')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromAssetRow(r as AssetRow))
}

export async function listAllValues(): Promise<AssetValue[]> {
  const { data, error } = await db()
    .from('wt_asset_values')
    .select('*')
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromValueRow(r as ValueRow))
}

export type CreateAssetInput = {
  name: string
  initialValue: number
  initialDate: string
  estimatedAnnualReturn: number
  monthlyContribution?: number
  contributionStart?: string | null
  contributionEnd?: string | null
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const { data: assetData, error: assetErr } = await db()
    .from('wt_assets')
    .insert({
      name: input.name,
      estimated_annual_return: input.estimatedAnnualReturn,
      monthly_contribution: input.monthlyContribution ?? 0,
      contribution_start: input.contributionStart ?? null,
      contribution_end: input.contributionEnd ?? null,
    })
    .select()
    .single()
  if (assetErr) throw assetErr
  const asset = fromAssetRow(assetData as AssetRow)

  const { error: valueErr } = await db().from('wt_asset_values').insert({
    asset_id: asset.id,
    value: input.initialValue,
    recorded_at: input.initialDate,
  })
  if (valueErr) throw valueErr

  return asset
}

export type AssetPatch = {
  name?: string
  estimatedAnnualReturn?: number
  monthlyContribution?: number
  contributionStart?: string | null
  contributionEnd?: string | null
}

export async function updateAsset(id: string, patch: AssetPatch): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.estimatedAnnualReturn !== undefined) update.estimated_annual_return = patch.estimatedAnnualReturn
  if (patch.monthlyContribution !== undefined) update.monthly_contribution = patch.monthlyContribution
  if (patch.contributionStart !== undefined) update.contribution_start = patch.contributionStart
  if (patch.contributionEnd !== undefined) update.contribution_end = patch.contributionEnd
  if (Object.keys(update).length === 0) return
  const { error } = await db().from('wt_assets').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await db().from('wt_assets').delete().eq('id', id)
  if (error) throw error
}

export async function addAssetValue(input: {
  assetId: string
  value: number
  recordedAt: string
}): Promise<void> {
  const { error } = await db().from('wt_asset_values').insert({
    asset_id: input.assetId,
    value: input.value,
    recorded_at: input.recordedAt,
  })
  if (error) throw error
}

export async function deleteAssetValue(id: string): Promise<void> {
  const { error } = await db().from('wt_asset_values').delete().eq('id', id)
  if (error) throw error
}
