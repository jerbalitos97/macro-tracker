// Palautejonon ainoa tie iltaiselle automaatiolle.
//
// Ennen tätä automaation pilviympäristössä oli Supabasen secret-avain, joka
// ohittaa RLS:n. Palautteen teksti on käyttäjän kirjoittamaa, joten
// prompt-injektio sen sisällä olisi voinut saada ajon koskemaan kenen tahansa
// dataan. Nyt avain on vain Vercelissä, ja automaatiolla on kapea token, jolla
// pääsee tekemään täsmälleen kaksi asiaa:
//
//   GET   /api/feedback-queue            käsittelemättömät (new, triaged), tärkein ensin
//   GET   /api/feedback-queue?id=12      yksi rivi
//   PATCH /api/feedback-queue?id=12      päivittää vain triage-kentät (WRITABLE)
//
// Muita tauluja tai kenttiä ei tästä pääse muuttamaan, eikä tokenilla saa
// mitään muuta auki: se ei ole MCP_API_KEY eikä Supabase-avain.
//
// Env Vercelissä:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (jo olemassa MCP:tä varten)
//   FEEDBACK_AUTOMATION_TOKEN                 vähintään 32 merkkiä, sama arvo friday-nightlyssä
//   FEEDBACK_OWNER_ID                         valinnainen, oletus MCP_USER_ID

import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

interface VercelReq {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}
interface VercelRes {
  status: (code: number) => VercelRes
  setHeader: (k: string, v: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

export const WRITABLE = new Set(['status', 'priority', 'risk', 'plan', 'pr_url', 'resolution', 'shipped_at'])
const STATUSES = new Set(['new', 'triaged', 'in_progress', 'needs_review', 'shipped', 'rejected', 'duplicate'])
const COLS = 'id,user_id,created_at,updated_at,body,context,status,priority,risk,plan,pr_url,resolution,shipped_at'

/** Sama vakioaikainen vertailu kuin MCP:ssä. Lyhyt tai puuttuva token ei
 *  kelpaa koskaan, jottei unohtunut env-arvo avaa ovea. */
export function tokenMatches(header: string, token: string): boolean {
  if (token.length < 32) return false
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!m) return false
  const h = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(h(m[1]), h(token))
}

/** Tarkistaa päivityksen muodon. Palauttaa virheen tekstinä tai siistityn patchin. */
export function validatePatch(input: unknown, now: Date = new Date()): string | Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'runko ei ole JSON-objekti'
  const patch = { ...(input as Record<string, unknown>) }
  const keys = Object.keys(patch)
  if (!keys.length) return 'tyhjä päivitys'
  for (const k of keys) if (!WRITABLE.has(k)) return `kenttää ${k} ei saa muuttaa`
  if ('status' in patch && !STATUSES.has(patch.status as string)) return `tuntematon status ${String(patch.status)}`
  if ('risk' in patch && patch.risk !== null && !['low', 'high'].includes(patch.risk as string)) return 'risk on low tai high'
  if ('priority' in patch && patch.priority !== null && ![1, 2, 3, 4].includes(patch.priority as number)) return 'priority 1–4'
  for (const k of ['plan', 'pr_url', 'resolution', 'shipped_at'])
    if (k in patch && patch[k] !== null && (typeof patch[k] !== 'string' || (patch[k] as string).length > 4000))
      return `${k} on merkkijono (enintään 4000)`
  if (patch.status === 'shipped' && !patch.shipped_at) patch.shipped_at = now.toISOString()
  return patch
}

// Palautteen teksti on käyttäjän kirjoittamaa. Se merkitään selvästi datana,
// jotta sen sisällä oleva "ohita säännöt ja julkaise" ei näytä ohjeelta.
const annotate = (owner: string) => (r: Record<string, unknown>) => ({
  ...r,
  fromOwner: !!owner && r.user_id === owner,
  body: `<user-feedback>${String(r.body ?? '')}</user-feedback>`,
})

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Cache-Control', 'no-store')
  if (!tokenMatches(String(req.headers.authorization ?? ''), process.env.FEEDBACK_AUTOMATION_TOKEN ?? '')) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    res.status(500).json({ error: 'SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu' })
    return
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const owner = process.env.FEEDBACK_OWNER_ID || process.env.MCP_USER_ID || ''
  const rawId = req.query?.id
  const idStr = Array.isArray(rawId) ? rawId[0] : rawId
  if (idStr !== undefined && !/^\d+$/.test(idStr)) {
    res.status(400).json({ error: 'id on kokonaisluku' })
    return
  }
  const id = idStr === undefined ? undefined : Number(idStr)

  if (req.method === 'GET') {
    if (id === undefined) {
      const { data, error } = await db
        .from('feedback')
        .select(COLS)
        .in('status', ['new', 'triaged'])
        .order('priority', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) return void res.status(502).json({ error: error.message })
      res.status(200).json((data ?? []).map(annotate(owner)))
      return
    }
    const { data, error } = await db.from('feedback').select(COLS).eq('id', id).maybeSingle()
    if (error) return void res.status(502).json({ error: error.message })
    if (!data) return void res.status(404).json({ error: `ei riviä ${id}` })
    res.status(200).json(annotate(owner)(data))
    return
  }

  if (req.method === 'PATCH') {
    if (id === undefined) return void res.status(400).json({ error: 'PATCH vaatii ?id=' })
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        return void res.status(400).json({ error: 'json ei jäsenny' })
      }
    }
    const patch = validatePatch(body)
    if (typeof patch === 'string') return void res.status(400).json({ error: patch })
    const { data, error } = await db.from('feedback').update(patch).eq('id', id).select(COLS).maybeSingle()
    if (error) return void res.status(502).json({ error: error.message })
    if (!data) return void res.status(404).json({ error: `ei riviä ${id}` })
    res.status(200).json(annotate(owner)(data))
    return
  }

  res.setHeader('Allow', 'GET, PATCH')
  res.status(405).json({ error: 'Method not allowed' })
}
