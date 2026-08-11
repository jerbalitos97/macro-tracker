// One wt_settings row per account: wealthGoal + currency.
//
// This used to be a single global row keyed on a hardcoded id = 1, from when
// the tool assumed one user. Ownership now lives in wt_settings.user_id and RLS
// only ever exposes the caller's own row, so the queries below don't filter by
// id at all — there is nothing else to match.

import { supabase } from '../supabase'
import type { Settings } from './types'

const DEFAULTS: Settings = { wealthGoal: null, currency: 'EUR' }

function db() {
  if (!supabase) throw new Error('Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).')
  return supabase
}

type SettingsRow = {
  wealth_goal: number | string | null
  currency: string
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db()
    .from('wt_settings')
    .select('wealth_goal, currency')
    .maybeSingle()
  if (error) throw error
  // An account that has never saved anything simply has no row yet.
  if (!data) return DEFAULTS
  const row = data as SettingsRow
  return {
    wealthGoal: row.wealth_goal === null ? null : Number(row.wealth_goal),
    currency: row.currency,
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  // user_id defaults to auth.uid() and is unique, so this creates the row on
  // first save and updates it every time after.
  const { error } = await db()
    .from('wt_settings')
    .upsert(
      { wealth_goal: next.wealthGoal, currency: next.currency, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) throw error
}
