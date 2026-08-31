import { supabase } from './supabase'
import type { Tool } from './roles'

// Kutsulinkit. Kaksi eri yleisöä samassa tiedostossa:
//
//   · kirjautumaton kutsuttu → checkInvite / redeemInvite, jotka kulkevat
//     palvelinfunktion kautta koska tilin luonti vaatii service-role-avaimen;
//   · admin → listInvites / createInvite / revokeInvite suoraan kantaan, jossa
//     RLS päästää läpi vain adminin.

const KUTSU_PARAM = 'kutsu'

/** Kutsutunnus osoitteesta, tai null. Sama kuvio kuin grocery-jakolinkissä. */
export function inviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const t = new URLSearchParams(window.location.search).get(KUTSU_PARAM)
  return t && t.trim() ? t.trim() : null
}

/** Poistaa kutsuparametrin osoitteesta ilman sivun uudelleenlatausta, jotta
 *  käytetty linkki ei jää selaimen historiaan tai jaettuun kirjanmerkkiin. */
export function clearInviteFromUrl(): void {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  u.searchParams.delete(KUTSU_PARAM)
  window.history.replaceState({}, '', u.pathname + u.search + u.hash)
}

/** Linkki jonka admin jakaa. Origin luetaan selaimesta, joten se on aina
 *  oikea eikä domainia tarvitse kirjoittaa mihinkään kovakoodattuna. */
export const inviteUrl = (token: string): string =>
  `${window.location.origin}/?${KUTSU_PARAM}=${token}`

// ── Kutsutun puoli ───────────────────────────────────────────

export interface InviteCheck {
  valid: boolean
  label?: string
  reason?: string
}

export async function checkInvite(token: string): Promise<InviteCheck> {
  const res = await fetch('/api/kutsu', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'check', token }),
  })
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null
    return { valid: false, reason: b?.error ?? 'Kutsun tarkistus ei onnistunut' }
  }
  return (await res.json()) as InviteCheck
}

/** Luo tilin kutsulla. Ei kirjaa sisään — soittaja tekee sen normaalilla
 *  signIn-kutsulla, jotta sessio syntyy samaa reittiä kuin muulloin. */
export async function redeemInvite(input: {
  token: string
  email: string
  password: string
  name: string
}): Promise<void> {
  const res = await fetch('/api/kutsu', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'redeem', ...input }),
  })
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(b?.error ?? 'Tunnuksen luonti ei onnistunut')
  }
}

// ── Adminin puoli ────────────────────────────────────────────

export interface Invite {
  token: string
  tools: Tool[]
  label: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
}

interface InviteRow {
  token: string
  tools: string[] | null
  label: string
  created_at: string
  expires_at: string
  used_at: string | null
}

const fromRow = (r: InviteRow): Invite => ({
  token: r.token,
  tools: (r.tools ?? []) as Tool[],
  label: r.label,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: r.used_at,
})

const COLS = 'token, tools, label, created_at, expires_at, used_at'

/** Avoimet kutsut uusin ensin. Käytetyt jätetään pois: ne ovat historiaa, ja
 *  admin-näkymä on työkalu eikä loki. */
export async function listOpenInvites(): Promise<Invite[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('invites')
    .select(COLS)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as InviteRow))
}

export async function createInvite(
  createdBy: string,
  tools: Tool[],
  label: string
): Promise<Invite> {
  if (!supabase) throw new Error('Ei yhteyttä kantaan')
  const { data, error } = await supabase
    .from('invites')
    .insert({ created_by: createdBy, tools, label })
    .select(COLS)
    .single()
  if (error) throw error
  return fromRow(data as InviteRow)
}

/** Peruu avoimen kutsun. Merkitään käytetyksi eikä poisteta, jotta jälki siitä
 *  että kutsu joskus luotiin ei katoa. */
export async function revokeInvite(token: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
  if (error) throw error
}
