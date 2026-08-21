import { supabase } from './supabase'

// LiikkuvuusPuu — motivaatiovisualisointi, jossa yksi kirjaus = yksi oksa.
//
// Pidetään erillään Fridayn treenilokista tarkoituksella. Sama sana
// ("liikkuvuus") esiintyy myös `workout_templates.kind = 'mobility'` -muodossa,
// mutta se on treeni jolla on sarjat ja kesto. Tämä on tikki puuhun. Näiden
// yhdistäminen laskisi puun kirjaukset treenivolyymiin ja paisuttaisi jokaisen
// session slot-määrää.

export interface MobilityLog {
  id: string
  logDate: string
  upperBody: boolean
  lowerBody: boolean
  createdAt: string
}

interface MobilityRow {
  id: string
  log_date: string
  upper_body: boolean
  lower_body: boolean
  created_at: string
}

const fromRow = (r: MobilityRow): MobilityLog => ({
  id: r.id,
  logDate: r.log_date,
  upperBody: r.upper_body,
  lowerBody: r.lower_body,
  createdAt: r.created_at,
})

const COLS = 'id, log_date, upper_body, lower_body, created_at'

/** Kaikki kirjaukset vanhimmasta uusimpaan — puu kasvaa kronologisesti, joten
 *  järjestys on osa lopputulosta eikä pelkkä esitysvalinta. */
export async function listMobilityLogs(userId: string): Promise<MobilityLog[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('mobility_logs')
    .select(COLS)
    .eq('user_id', userId)
    .order('log_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as MobilityRow))
}

export async function logMobility(
  userId: string,
  logDate: string,
  upperBody: boolean,
  lowerBody: boolean
): Promise<MobilityLog | null> {
  if (!supabase) return null
  // Sama sääntö on kannassa check-rajoitteena; tämä antaa siitä suomenkielisen
  // virheen ennen turhaa verkkokutsua.
  if (!upperBody && !lowerBody) throw new Error('Valitse vähintään yläkroppa tai alakroppa')
  const { data, error } = await supabase
    .from('mobility_logs')
    .insert({ user_id: userId, log_date: logDate, upper_body: upperBody, lower_body: lowerBody })
    .select(COLS)
    .single()
  if (error) throw error
  return fromRow(data as MobilityRow)
}

export async function deleteMobilityLog(userId: string, id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('mobility_logs').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export function countLeaves(logs: MobilityLog[]): { upper: number; lower: number; total: number } {
  let upper = 0
  let lower = 0
  for (const l of logs) {
    if (l.upperBody) upper++
    if (l.lowerBody) lower++
  }
  return { upper, lower, total: upper + lower }
}
