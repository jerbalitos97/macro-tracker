// Kuva → kalorit ja proteiini.
//
// Ainoa aidosti uusi backend-pala tässä työssä, ja etuoikeutettu: se kuluttaa
// ANTHROPIC_API_KEY:tä. Siksi se ei ole avoin päätepiste vaan tarkistaa
// kutsujan kolmella tasolla:
//
//   1. Supabase-JWT täytyy olla voimassa (auth.getUser hoitaa allekirjoituksen).
//   2. Kutsujalla täytyy olla `fitness:photo`-oikeus kannassa. Sama sääntö kuin
//      käyttöliittymässä, mutta täällä se pitää myös suoraa curl-kutsua vastaan —
//      muuten kuvakortin piilottaminen olisi koko pääsynhallinta.
//   3. Kuvan koko on rajattu, jotta yksi pyyntö ei polta budjettia.
//
// Kuvaa ei tallenneta mihinkään. Se lähtee Anthropicille analysoitavaksi ja
// katoaa; vain luvut ja kuvaus päätyvät kantaan käyttäjän hyväksynnän jälkeen.
//
// Vaadittavat env-muuttujat Vercelissä:
//   ANTHROPIC_API_KEY            — Anthropic Console
//   SUPABASE_URL                 — sama kuin VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    — oikeustarkistukseen (ohittaa RLS:n lukiessa)

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Opus 5, koska arvio on numeerinen päättely kuvasta eikä pelkkä tunnistus:
// annoskoko, ainesosien määrä ja niiden ravintosisältö yhdessä. Halvempi malli
// tunnistaa ruoan mutta arvioi määrät selvästi huonommin, ja väärä luku
// päiväkirjassa on pahempi kuin muutama sentti kuvaa kohden.
const MODEL = 'claude-opus-5'

// 6 MB base64 ≈ 4,5 MB kuva. Puhelimen kamerakuva mahtuu tähän skaalattuna;
// raakaa 12 megapikselin kuvaa ei ole tarkoitus lähettää, ja selain kutistaa
// sen ennen lähetystä (ks. MealCapture).
const MAX_BASE64_BYTES = 6 * 1024 * 1024

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const

const SYSTEM_PROMPT = `Olet ravitsemusanalyytikko. Saat kuvan ateriasta ja mahdollisesti käyttäjän korjauksen aiempaan arvioon. Tunnista annoksen ainekset ja arvioi sen kalori- ja proteiinimäärä realistisesti.

Arvioi annoskoko kuvasta: astian koko, kerroksen paksuus ja ainesten suhteet kertovat määrän. Älä anna geneeristä keskiarvoa vaan arvio juuri tästä annoksesta.

Jos käyttäjä on antanut korjauksen, kuuntele sitä — hän tietää annoksensa paremmin kuin sinä kuvasta. Päivitä kuvaus, ainekset ja luvut vastaamaan korjattua tulkintaa.

Kirjoita kuvaus ja ainekset suomeksi. Merkitse luottamus matalaksi jos kuva on epäselvä tai annoskoko vaikea päätellä.`

const AnalysisSchema = z.object({
  description: z.string().describe('Lyhyt suomenkielinen kuvaus annoksesta, enintään 60 merkkiä'),
  items: z.array(z.string()).describe('Yksittäiset tunnistetut ruoka-aineet suomeksi'),
  calories: z.number().int().describe('Arvioidut kalorit kokonaislukuna'),
  protein: z.number().int().describe('Arvioitu proteiini grammoina kokonaislukuna'),
  confidence: z.enum(['low', 'medium', 'high']).describe('Kuinka varma arvio on'),
})

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
  const mediaType = (ALLOWED_MEDIA as readonly string[]).includes(rawMedia)
    ? (rawMedia as (typeof ALLOWED_MEDIA)[number])
    : 'image/jpeg'
  const correction = typeof body.userCorrection === 'string' ? body.userCorrection.trim().slice(0, 300) : ''

  if (!imageBase64) {
    res.status(400).json({ error: 'Kuva puuttuu' })
    return
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    res.status(413).json({ error: 'Kuva on liian suuri' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Selkeä virhe eikä keksitty arvio: tekaistu luku päiväkirjassa on
    // pahempi kuin toimimaton nappi, koska se näyttää oikealta.
    res.status(503).json({ error: 'Kuva-analyysi ei ole vielä konfiguroitu (ANTHROPIC_API_KEY puuttuu)' })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(AnalysisSchema) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            {
              type: 'text',
              text: correction
                ? `Analysoi annos. Käyttäjän korjaus aiempaan arvioon: "${correction}". Päivitä arvio sen mukaan.`
                : 'Analysoi annos.',
            },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: 'Kuvaa ei voitu analysoida. Kirjaa annos käsin.' })
      return
    }

    const parsed = response.parsed_output
    if (!parsed) {
      res.status(502).json({ error: 'Analyysin muoto ei kelvannut. Yritä uudelleen tai kirjaa käsin.' })
      return
    }

    res.status(200).json({
      description: parsed.description.slice(0, 80),
      items: parsed.items.slice(0, 12).map(String),
      // Selkeät rajat: negatiivinen tai absurdi luku on virhe eikä arvio.
      calories: Math.max(0, Math.min(5000, Math.round(parsed.calories))),
      protein: Math.max(0, Math.min(400, Math.round(parsed.protein))),
      confidence: parsed.confidence,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tuntematon virhe'
    res.status(502).json({ error: `Analyysi ei onnistunut: ${message}` })
  }
}
