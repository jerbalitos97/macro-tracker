// Kutsulinkin tarkistus ja lunastus.
//
// Kaksi toimintoa, molemmat ilman kirjautumista — kutsuttu ei ole vielä
// kukaan. Turva ei siis tule sessiosta vaan siitä että tunnus on arvaamaton,
// kertakäyttöinen ja vanheneva:
//
//   check   {token}                    → kelpaako linkki (ei paljasta työkaluja)
//   redeem  {token, email, password, name} → luo tilin ja myöntää kutsun työkalut
//
// Tili luodaan service-role-avaimella (auth.admin.createUser), ei selaimen
// signUp-kutsulla. Se on tarkoituksellista: kun avoin rekisteröityminen
// suljetaan Supabasen dashboardista, tämä reitti jää ainoaksi tavaksi päästä
// sisään, ja silloin työkalut on myönnetty jo ensimmäisellä kirjautumisella
// eikä käyttäjä käy välillä oletusten varassa.
//
// Vaadittavat env-muuttujat Vercelissä:
//   SUPABASE_URL                 — sama kuin VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    — Supabase Settings → API → service_role

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

const admin = () =>
  createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

/** GoTruen oma minimi. Tarkistetaan tässäkin, jotta virhe on suomeksi. */
const MIN_PASSWORD = 6

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Vain POST' })
    return
  }
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Kutsut eivät ole konfiguroitu' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const action = typeof body.action === 'string' ? body.action : ''
  const token = typeof body.token === 'string' ? body.token.trim() : ''

  if (!isUuid(token)) {
    res.status(400).json({ error: 'Virheellinen kutsulinkki' })
    return
  }

  const db = admin()

  // ── check ──────────────────────────────────────────────────
  // Palauttaa vain kelpaako linkki ja kenelle se oli tarkoitettu. Työkaluja ei
  // paljasteta: ne eivät kuulu kirjautumattomalle, ja kutsuttu näkee ne heti
  // sisään päästyään.
  if (action === 'check') {
    const { data } = await db
      .from('invites')
      .select('label, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    const row = data as { label: string; expires_at: string; used_at: string | null } | null
    if (!row) {
      res.status(200).json({ valid: false, reason: 'Tuntematon kutsulinkki' })
      return
    }
    if (row.used_at) {
      res.status(200).json({ valid: false, reason: 'Tämä kutsu on jo käytetty' })
      return
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      res.status(200).json({ valid: false, reason: 'Kutsu on vanhentunut' })
      return
    }
    res.status(200).json({ valid: true, label: row.label })
    return
  }

  // ── redeem ─────────────────────────────────────────────────
  if (action !== 'redeem') {
    res.status(400).json({ error: 'Tuntematon toiminto' })
    return
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : ''

  if (!email.includes('@')) {
    res.status(400).json({ error: 'Tarkista sähköpostiosoite' })
    return
  }
  if (password.length < MIN_PASSWORD) {
    res.status(400).json({ error: `Salasanassa on oltava vähintään ${MIN_PASSWORD} merkkiä` })
    return
  }

  // Varataan kutsu ENNEN tilin luontia. Ehdollinen päivitys on atominen, joten
  // kaksi yhtaikaista lunastusta samalla linkillä ei voi molempi onnistua:
  // toinen saa nolla riviä. Jos tilin luonti sen jälkeen kaatuu, varaus
  // vapautetaan alla — muuten yksi kirjoitusvirhe polttaisi koko linkin.
  const { data: claimed, error: claimError } = await db
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('tools, label')

  if (claimError) {
    res.status(500).json({ error: 'Kutsun tarkistus ei onnistunut' })
    return
  }
  const invite = (claimed ?? [])[0] as { tools: string[]; label: string } | undefined
  if (!invite) {
    res.status(409).json({ error: 'Kutsu on jo käytetty tai vanhentunut' })
    return
  }

  const release = async () => {
    await db.from('invites').update({ used_at: null }).eq('token', token)
  }

  // Tili luodaan vahvistettuna: kutsulinkki ON se vahvistus, ja
  // vahvistussähköpostin odottaminen jättäisi käyttäjän jumiin.
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !created?.user) {
    await release()
    const msg = createError?.message ?? ''
    // Yleisin syy on olemassa oleva tili; sanotaan se suoraan sen sijaan että
    // näytettäisiin GoTruen englanninkielinen virhe.
    const already = /already|registered|exists/i.test(msg)
    res.status(already ? 409 : 500).json({
      error: already ? 'Tällä sähköpostilla on jo tunnus — kirjaudu sisään' : 'Tilin luonti ei onnistunut',
    })
    return
  }

  const userId = created.user.id

  // Työkalut ja näyttönimi samalla kertaa, jotta käyttäjä ei käy hetkeäkään
  // oletusten varassa eikä ilmesty admin-listaan nimettömänä.
  const [{ error: appUserError }, { error: toolsError }] = await Promise.all([
    db.from('app_users').upsert(
      { user_id: userId, display_name: name || email.split('@')[0], is_admin: false },
      { onConflict: 'user_id' }
    ),
    db.from('user_tools').upsert(
      { user_id: userId, tools: invite.tools, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ),
  ])

  if (appUserError || toolsError) {
    // Tili on jo olemassa, joten kutsua ei vapauteta — muuten sama sähköposti
    // törmäisi seuraavalla yrityksellä "on jo tunnus" -virheeseen ja linkki
    // olisi käyttökelvoton. Admin voi myöntää työkalut käsin.
    res.status(500).json({
      error: 'Tunnus luotiin, mutta oikeuksien asetus epäonnistui. Pyydä ylläpitäjää tarkistamaan.',
    })
    return
  }

  await db.from('invites').update({ used_by: userId }).eq('token', token)

  res.status(200).json({ ok: true })
}
