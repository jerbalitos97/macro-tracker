import { supabase } from './supabase'

// Palauteportaali — käyttäjän puoli.
//
// Pilvi-only. Palaute on viesti automaatiolle, joka lukee sen kannasta, joten
// paikallinen kopio olisi vain välimuisti jota kukaan ei lue. Ilman yhteyttä
// lähetys epäonnistuu näkyvästi ja teksti jää kenttään, ei hiljaiseen jonoon.
//
// Tilan muuttaa vain automaatio (ks. migraatio 20261105_feedback.sql); täältä
// voi lisätä ja lukea, ei muuttaa.

export type FeedbackStatus =
  | 'new' | 'triaged' | 'in_progress' | 'needs_review' | 'shipped' | 'rejected' | 'duplicate'

export interface Feedback {
  id: number
  createdAt: string
  body: string
  context: FeedbackContext
  status: FeedbackStatus
  priority: number | null
  risk: 'low' | 'high' | null
  plan: string | null
  prUrl: string | null
  resolution: string | null
  shippedAt: string | null
}

export interface FeedbackContext {
  /** Näkymä jossa käyttäjä oli viimeksi ennen palautteen avaamista. */
  view?: string
  userAgent?: string
  viewport?: string
}

interface FeedbackRow {
  id: number
  created_at: string
  body: string
  context: FeedbackContext | null
  status: FeedbackStatus
  priority: number | null
  risk: 'low' | 'high' | null
  plan: string | null
  pr_url: string | null
  resolution: string | null
  shipped_at: string | null
}

const COLS = 'id, created_at, body, context, status, priority, risk, plan, pr_url, resolution, shipped_at'

const fromRow = (r: FeedbackRow): Feedback => ({
  id: r.id,
  createdAt: r.created_at,
  body: r.body,
  context: r.context ?? {},
  status: r.status,
  priority: r.priority,
  risk: r.risk,
  plan: r.plan,
  prUrl: r.pr_url,
  resolution: r.resolution,
  shippedAt: r.shipped_at,
})

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'Odottaa',
  triaged: 'Jonossa',
  in_progress: 'Työn alla',
  needs_review: 'Odottaa hyväksyntää',
  shipped: 'Julkaistu',
  rejected: 'Ei tehdä',
  duplicate: 'Sama kuin toinen',
}

export function feedbackAvailable(): boolean {
  return !!supabase
}

export async function listMyFeedback(userId: string): Promise<Feedback[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('feedback')
    .select(COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return (data as FeedbackRow[]).map(fromRow)
}

/** Palauttaa luodun rivin, tai virheviestin suomeksi. */
export async function submitFeedback(
  userId: string,
  body: string,
  view: string | undefined,
): Promise<{ ok: true; item: Feedback } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Palaute vaatii kirjautumisen.' }
  const text = body.trim()
  if (text.length < 3) return { ok: false, message: 'Kirjoita vähän enemmän.' }
  const context: FeedbackContext = {
    view,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  }
  const { data, error } = await supabase
    .from('feedback')
    .insert({ user_id: userId, body: text, context })
    .select(COLS)
    .single()
  if (error || !data) {
    return { ok: false, message: navigator.onLine ? 'Lähetys epäonnistui.' : 'Ei yhteyttä — yritä uudelleen.' }
  }
  return { ok: true, item: fromRow(data as FeedbackRow) }
}
