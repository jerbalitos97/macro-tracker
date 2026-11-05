import { supabase } from './supabase'
import { markLockOffer } from './appLock'

// Salasanan palautus linkillä, jonka admin luo ja lähettää itse.
// Palvelinpuoli ja perustelut: api/salasana.ts.

const PARAM = 'palauta'

export function recoveryTokenFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(PARAM)
  } catch {
    return null
  }
}

export function clearRecoveryFromUrl(): void {
  const u = new URL(window.location.href)
  u.searchParams.delete(PARAM)
  window.history.replaceState(null, '', u.pathname + u.search + u.hash)
}

/** Admin: luo linkin toiselle käyttäjälle. */
export async function createRecoveryLink(
  userId: string,
): Promise<{ link: string; email: string }> {
  if (!supabase) throw new Error('Palautus vaatii pilviyhteyden')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Kirjaudu sisään')
  const res = await fetch('/api/salasana', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId }),
  })
  const body = (await res.json().catch(() => ({}))) as { link?: string; email?: string; error?: string }
  if (!res.ok || !body.link) throw new Error(body.error ?? 'Linkin luonti ei onnistunut')
  return { link: body.link, email: body.email ?? '' }
}

/** Linkin avaaja: kuluttaa tunnuksen ja kirjaa sisään palautusistuntoon. */
export async function redeemRecovery(tokenHash: string): Promise<string | null> {
  if (!supabase) return 'Palautus vaatii pilviyhteyden'
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  if (!error) return null
  return /expired|invalid/i.test(error.message)
    ? 'Linkki on vanhentunut tai jo käytetty. Pyydä uusi linkki.'
    : 'Linkin tarkistus ei onnistunut'
}

export async function setNewPassword(password: string): Promise<string | null> {
  if (!supabase) return 'Palautus vaatii pilviyhteyden'
  const { error } = await supabase.auth.updateUser({ password })
  if (!error) {
    markLockOffer()
    return null
  }
  return /different|same/i.test(error.message)
    ? 'Valitse eri salasana kuin aiemmin'
    : 'Salasanan vaihto ei onnistunut'
}
