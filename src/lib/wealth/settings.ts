// Single-row wt_settings: wealthGoal + currency. id is always 1.

import { supabase } from '../supabase'
import type { Settings } from './types'

function db() {
  if (!supabase) throw new Error('Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).')
  return supabase
}

type SettingsRow = {
  id: number
  wealth_goal: number | string | null
  currency: string
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db()
    .from('wt_settings')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) throw error
  const row = data as SettingsRow
  return {
    wealthGoal: row.wealth_goal === null ? null : Number(row.wealth_goal),
    currency: row.currency,
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.wealthGoal !== undefined) update.wealth_goal = patch.wealthGoal
  if (patch.currency !== undefined) update.currency = patch.currency
  update.updated_at = new Date().toISOString()
  const { error } = await db().from('wt_settings').update(update).eq('id', 1)
  if (error) throw error
}
