// Kuva → kalorit ja proteiini.
//
// Etuoikeutettu päätepiste: se kuluttaa OPENROUTER_API_KEY:tä. Siksi se ei
// ole avoin vaan tarkistaa kutsujan kolmella tasolla:
//
//   1. Supabase-JWT täytyy olla voimassa (auth.getUser hoitaa allekirjoituksen).
//   2. Kutsujalla täytyy olla `fitness:photo`-oikeus kannassa. Sama sääntö kuin
//      käyttöliittymässä, mutta täällä se pitää myös suoraa curl-kutsua vastaan —
//      muuten kuvakortin piilottaminen olisi koko pääsynhallinta.
//   3. Kuvan koko on rajattu, jotta yksi pyyntö ei polta kiintiötä.
//
// Kuvaa ei tallenneta mihinkään. Se lähtee OpenRouterille analysoitavaksi ja
// katoaa; vain luvut ja kuvaus päätyvät kantaan käyttäjän hyväksynnän jälkeen.
//
// Yksi tarjoaja, ei valintaa: kaikki käyttäjät saavat saman reitin ilman
// asetuksia. Malli vaihdetaan env-muuttujalla, ei koodissa.
//
// Vaadittavat env-muuttujat Vercelissä:
//   OPENROUTER_API_KEY           — openrouter.ai, ainoa pakollinen uusi muuttuja
//   OPENROUTER_MODEL             — valinnainen, oletus ks. _mealVision.ts
//   SUPABASE_URL                 — sama kuin VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    — oikeustarkistukseen (ohittaa RLS:n lukiessa)

import { createClient } from '@supabase/supabase-js'
// .js-pääte: paketti on ESM, ja Vercelin Node-ajossa suhteellinen import
// tarvitsee päätteen. TypeScript ratkaisee sen .ts-tiedostoon.
import { DEFAULT_OPENROUTER_MODEL, VisionError, analyseWithOpenRouter } from './_mealVision.js'

// 6 MB base64 ≈ 4,5 MB kuva. Selain kutistaa kuvan 1024 px:iin ennen
// lähetystä (ks. mealPhoto.ts), joten tämä on vain katto suoria kutsuja vastaan.
const MAX_BASE64_BYTES = 6 * 1024 * 1024

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const

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

const supabaseUrl = process.env.SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Palauttaa kutsujan user_id:n jos JWT on voimassa, muuten null. */
async function authenticate(bearer: string): Promise<string | null> {
  if (!supabaseUrl || !serviceKey) return null
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.getUser(bearer)
  if (error || !data.user) return null
  return data.user.id
}

/**
 * Onko käyttäjällä kuvalisä käytössä. Sama resoluutio kuin roles.ts:ssä:
 * kannan rivi voittaa, ja rivin puuttuminen tarkoittaa oletuksia.
 *
 * Oletukset on tarkoituksella kirjoitettu tähän eikä importattu clientistä:
 * `src/` kääntyy selaimeen ja tällä funktiolla on eri tsconfig. Jos
 * DEFAULT_TOOLS muuttuu, tämä lista pitää päivittää mukana — siksi lista on
 * lyhyt ja kommentoitu molemmissa päissä.
 */
async function hasPhotoTool(userId: string): Promise<boolean> {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [{ data: toolsRow }, { data: userRow }] = await Promise.all([
    admin.from('user_tools').select('tools').eq('user_id', userId).maybeSingle(),
    admin.from('app_users').select('is_admin').eq('user_id', userId).maybeSingle(),
  ])
  if (toolsRow && Array.isArray((toolsRow as { tools: unknown }).tools)) {
    const tools = (toolsRow as { tools: string[] }).tools
    // Kuvalisä vaatii myös ydintyökalun — sama sääntö kuin clientin
    // normalisoinnissa, jotta epäjohdonmukainen rivi ei avaa mitään.
    return tools.includes('fitness:photo') && tools.includes('fitness') && tools.includes('fitness:core')
  }
  // Ei riviä → oletukset. Admin saa kaiken; muille oletus on
  // ['tasks', 'mobility'], jossa kuvalisää ei ole (ks. src/lib/roles.ts).
  return (userRow as { is_admin?: boolean } | null)?.is_admin === true
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Vain POST' })
    return
  }

  const authHeader = req.headers.authorization
  const bearer = (Array.isArray(authHeader) ? authHeader[0] : authHeader ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer) {
    res.status(401).json({ error: 'Kirjautuminen puuttuu' })
    return
  }

  const userId = await authenticate(bearer)
  if (!userId) {
    res.status(401).json({ error: 'Istunto ei kelpaa' })
    return
  }
  if (!(await hasPhotoTool(userId))) {
    res.status(403).json({ error: 'Kuvalisä ei ole käytössä tällä tilillä' })
    return
  }

  const body = (req.body ?? {}) as {
    imageBase64?: unknown
    mediaType?: unknown
    userCorrection?: unknown
  }
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
  const rawMedia = typeof body.mediaType === 'string' ? body.mediaType : 'image/jpeg'
  const mediaType = (ALLOWED_MEDIA as readonly string[]).includes(rawMedia) ? rawMedia : 'image/jpeg'
  const correction = typeof body.userCorrection === 'string' ? body.userCorrection.trim().slice(0, 300) : ''

  if (!imageBase64) {
    res.status(400).json({ error: 'Kuva puuttuu' })
    return
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    res.status(413).json({ error: 'Kuva on liian suuri' })
    return
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    // Selkeä virhe eikä keksitty arvio: tekaistu luku päiväkirjassa on
    // pahempi kuin toimimaton nappi, koska se näyttää oikealta.
    res.status(503).json({ error: 'Kuva-analyysi ei ole vielä konfiguroitu (OPENROUTER_API_KEY puuttuu)' })
    return
  }

  try {
    const estimate = await analyseWithOpenRouter({
      apiKey,
      model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
      imageDataUrl: `data:${mediaType};base64,${imageBase64}`,
      correction,
    })
    res.status(200).json(estimate)
  } catch (e) {
    if (e instanceof VisionError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    const message = e instanceof Error ? e.message : 'Tuntematon virhe'
    res.status(502).json({ error: `Analyysi ei onnistunut: ${message}` })
  }
}
