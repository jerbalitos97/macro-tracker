import { supabase } from './supabase'
import { parseTools, type Tool } from './roles'

// `app_users` ja `user_tools` — kuka appia käyttää ja mihin pääsee.
//
// Käyttäjä LUKEE oman oikeusrivinsä mutta ei kirjoita sitä. Kirjoitusreitti on
// vain adminilla, ja se rajaus on RLS:ssä (ks. migraatio), ei täällä. Nämä
// funktiot eivät ole turvaraja — ne ovat käyttöliittymän tapa kysyä kannalta
// mitä se saa näyttää.

export interface AppUser {
  userId: string
  displayName: string
  isAdmin: boolean
}

interface AppUserRow {
  user_id: string
  display_name: string
  is_admin: boolean
}

const fromRow = (r: AppUserRow): AppUser => ({
  userId: r.user_id,
  displayName: r.display_name,
  isAdmin: r.is_admin,
})

/** Kutsujan oma käyttäjärivi, tai null jos riviä ei ole tai kanta ei vastaa.
 *  Null EI tarkoita adminia — soittaja käsittelee sen ei-adminina. */
export async function getMyAppUser(userId: string): Promise<AppUser | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id, display_name, is_admin')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return fromRow(data as AppUserRow)
}

/** Kutsujan oma oikeusrivi. Null = riviä ei ole, jolloin oletukset ratkaisevat. */
export async function getMyToolsOverride(userId: string): Promise<Tool[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_tools')
    .select('tools')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return parseTools((data as { tools: unknown }).tools)
}

/** Näyttönimen kirjaus omalle riville. Kutsutaan kirjautumisen jälkeen, jotta
 *  admin-näkymä näkee käyttäjän nimellä eikä pelkkänä UUID:na — `auth.users` ei
 *  ole anon-avaimella luettavissa. `is_admin` jätetään koskematta: RLS:n
 *  insert-policy vaatii sen olevan false, ja adminin rivi on jo olemassa. */
export async function ensureAppUser(userId: string, fallbackName: string): Promise<void> {
  if (!supabase) return
  const existing = await getMyAppUser(userId)
  if (existing) {
    if (existing.displayName !== '') return
    await supabase
      .from('app_users')
      .update({ display_name: fallbackName, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    return
  }
  await supabase.from('app_users').insert({
    user_id: userId,
    display_name: fallbackName,
    is_admin: false,
  })
}

// ── Admin-reitit ─────────────────────────────────────────────
// Nämä onnistuvat vain adminilta. Ei-adminin kutsu ei palauta tyhjää vaan
// nimenomaan sen mitä RLS päästää läpi: oman rivin. Siksi admin-näkymä on myös
// portitettu erikseen.

export async function listAppUsers(): Promise<AppUser[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id, display_name, is_admin')
    .order('display_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as AppUserRow))
}

export async function listAllToolOverrides(): Promise<Record<string, Tool[]>> {
  if (!supabase) return {}
  const { data, error } = await supabase.from('user_tools').select('user_id, tools')
  if (error) throw error
  const out: Record<string, Tool[]> = {}
  for (const r of (data ?? []) as Array<{ user_id: string; tools: unknown }>) {
    out[r.user_id] = parseTools(r.tools) ?? []
  }
  return out
}

export async function setToolsFor(userId: string, tools: Tool[]): Promise<void> {
  if (!supabase) throw new Error('Ei yhteyttä kantaan')
  const { error } = await supabase
    .from('user_tools')
    .upsert(
      { user_id: userId, tools, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) throw error
}
