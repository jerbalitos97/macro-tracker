// Salasanan palautuslinkki, jonka admin kopioi ja lähettää itse (esim. WhatsAppilla).
//
// POST {userId}  Authorization: Bearer <adminin access token>
//   → { link, email }
//
// Miksi ei Supabasen omaa action_linkiä: se on GET-osoite, joka kuluttaa
// kertakäyttöisen tunnuksen heti kun joku hakee sen. WhatsApp, iMessage ja
// Slack hakevat jokaisesta linkistä esikatselun, joten linkki olisi käytetty
// ennen kuin vastaanottaja ehtii painaa sitä. Tässä linkki osoittaa sovellukseen
// (`/?palauta=<token_hash>`); esikatselu lataa vain sivun, ja tunnus kulutetaan
// vasta kun sovelluksen JavaScript kutsuu verifyOtp:tä.
//
// Linkki on kirjautumisoikeus siihen tiliin, kunnes se käytetään tai vanhenee
// (Supabasen OTP-vanhenemisaika, oletus 1 h). Siksi:
//   · vain admin saa luoda sen — tarkistetaan kutsujan omasta sessiosta ja
//     app_users.is_admin-rivistä, ei pyynnön sisällöstä
//   · origin otetaan pyynnön Host-otsakkeesta, ei bodysta, jotta linkkiä ei voi
//     ohjata vieraaseen osoitteeseen
//   · salasanaa ei näe kukaan: käyttäjä valitsee sen itse linkin takana
//
// Vaadittavat env-muuttujat Vercelissä: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js'

interface VercelReq {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface VercelRes {
  status: (code: number) => VercelRes
  setHeader: (k: string, v: string) => void
  json: (body: unknown) => void
  end: (body?: string) => void
}

const url = process.env.SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const header = (req: VercelReq, name: string): string => {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] ?? '' : v ?? ''
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Vain POST' })
    return
  }
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Palautus ei ole konfiguroitu' })
    return
  }

  const jwt = header(req, 'authorization').replace(/^Bearer\s+/i, '')
  if (!jwt) {
    res.status(401).json({ error: 'Kirjaudu sisään' })
    return
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // Kuka kysyy — Supabase vahvistaa tokenin, ei luoteta mihinkään mitä
  // asiakas itse väittää.
  const { data: caller, error: callerError } = await db.auth.getUser(jwt)
  if (callerError || !caller?.user) {
    res.status(401).json({ error: 'Istunto on vanhentunut — kirjaudu uudelleen' })
    return
  }
  const { data: adminRow } = await db
    .from('app_users')
    .select('is_admin')
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (!(adminRow as { is_admin?: boolean } | null)?.is_admin) {
    res.status(403).json({ error: 'Vain ylläpitäjä voi luoda palautuslinkin' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!isUuid(userId)) {
    res.status(400).json({ error: 'Tuntematon käyttäjä' })
    return
  }

  const { data: target, error: targetError } = await db.auth.admin.getUserById(userId)
  const email = target?.user?.email
  if (targetError || !email) {
    res.status(404).json({ error: 'Käyttäjällä ei ole sähköpostia' })
    return
  }

  const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'recovery', email })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    res.status(500).json({ error: 'Linkin luonti ei onnistunut' })
    return
  }

  const host = header(req, 'x-forwarded-host') || header(req, 'host')
  const proto = header(req, 'x-forwarded-proto') || 'https'
  if (!host) {
    res.status(400).json({ error: 'Osoite puuttuu' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    link: `${proto}://${host}/?palauta=${encodeURIComponent(tokenHash)}`,
    email,
  })
}
