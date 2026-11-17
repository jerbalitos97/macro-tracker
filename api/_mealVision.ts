// Ruokakuvan arvion yhteinen muoto ja OpenRouter-tarjoaja.
//
// Alaviiva nimen alussa: Vercel ei tee tästä omaa funktiota, vaan
// ruoka-analysoi.ts importtaa sen. Tiedostossa ei ole Supabase-riippuvuutta,
// jotta sen voi testata ilman verkkoa (ks. _mealVision.test.ts).
//
// Env-muuttujat:
//   OPENROUTER_API_KEY    — pakollinen
//   OPENROUTER_MODEL      — malli tai pilkkulista (max 3), oletus DEFAULT_OPENROUTER_MODELS
//
// Ilmaistason mallilla on minuuttikohtainen rate limit, ja ilmaismallien
// tarjoajat voivat lokittaa syötteet. Jos käyttäjiä tulee lisää tai arviot
// ovat heikkoja, maksullinen malli vaihdetaan OPENROUTER_MODELilla.

import { z } from 'zod'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// qwen/qwen2.5-vl-72b-instruct:free poistui OpenRouterin luettelosta
// (tarkistettu 12.11.2026 /api/v1/models). Ilmaiset mallit vaihtuvat usein:
// jos analyysi alkaa palauttaa "No endpoints found", tarkista luettelo ja
// vaihda OPENROUTER_MODEL Vercelissä ennen kuin muutat tätä.
//
// Lista eikä yksi malli: ilmaismallilla on tyypillisesti yksi tarjoaja, jonka
// oma ilmaiskiintiö loppuu kaikilta OpenRouterin käyttäjiltä yhteisesti.
// Ensimmäinen kokeilu tuotannossa sai 429:n heti ensimmäisestä kuvasta.
// OpenRouter kokeilee `models`-listan mallit järjestyksessä, joten yhden
// ruuhka ei kaada analyysia.
export const DEFAULT_OPENROUTER_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-26b-a4b-it:free',
]

/** OPENROUTER_MODEL voi olla yksi malli tai pilkuilla erotettu lista. */
export function parseModels(env: string | undefined): string[] {
  const list = (env ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list.slice(0, 3) : DEFAULT_OPENROUTER_MODELS
}

// Kielivaatimus erikseen ja kahdesti (kehote + käyttäjäviesti): ilmaismallit
// vastasivat suomenkieliseenkin kehotteeseen englanniksi, kun JSON-avaimet
// ovat englantia. Avaimet pysyvät englanniksi, arvot suomeksi.
export const OPENROUTER_SYSTEM_PROMPT =
  "Arvioi kuvan ateria. Palauta VAIN JSON: {items:[{name, grams, kcal, protein_g}], total_kcal, total_protein_g, kcal_range:[min,max], confidence:'low'|'medium'|'high', notes}. Luvut numeroina ilman yksiköitä. Jos annoskoko on epävarma, levennä kcal_rangea. " +
  'Kirjoita name- ja notes-kenttien arvot AINA suomeksi (esim. "Kanafilee", "Keitetty riisi"), vaikka JSON-avaimet ovat englanniksi. ' +
  'confidence on poikkeus: täsmälleen low, medium tai high englanniksi.'

export const RATE_LIMIT_MESSAGE = 'Kuva-analyysi on ruuhkautunut — yritä hetken päästä.'

/** Odotus 429:n jälkeen, jos Retry-After puuttuu. Ilmaistason raja on
 *  minuuttikohtainen, joten muutama sekunti riittää usein; pidempi odotus
 *  tuntuisi puhelimella jumilta. */
const RATE_LIMIT_WAIT_MS = 4000
const RATE_LIMIT_WAIT_MAX_MS = 8000
const REQUEST_TIMEOUT_MS = 45_000

/** Malli palauttaa joskus luvut merkkijonoina ("350", "350 kcal", "12,5 g")
 *  — hyväksytään ne, mutta ei tyhjää eikä muuta kuin lukua. */
function toNumber(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const m = v.replace(/\s/g, '').replace(',', '.').match(/^~?(-?\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : v
}
const num = z.preprocess(toNumber, z.number().finite().nonnegative())

/** Varmuus suomeksi tai muuten väärin kirjoitettuna. Kehote pyytää
 *  suomenkieliset arvot (1750745), ja osa malleista käänsi myös tämän
 *  enum-kentän ("keskitaso"), jolloin koko vastaus hylättiin. Tuntematon arvo
 *  on "low": epävarma tulkinta ei saa näyttää varmalta. */
const CONFIDENCE: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'low', matala: 'low', alhainen: 'low', heikko: 'low', pieni: 'low', epävarma: 'low',
  medium: 'medium', keskitaso: 'medium', keskitasoinen: 'medium', kohtalainen: 'medium',
  keskinkertainen: 'medium', keskiverto: 'medium', 'melko varma': 'medium',
  high: 'high', korkea: 'high', hyvä: 'high', suuri: 'high', varma: 'high',
}
const confidence = z.preprocess(
  (v) => (typeof v === 'string' ? (CONFIDENCE[v.trim().toLowerCase()] ?? 'low') : v),
  z.enum(['low', 'medium', 'high']),
)

/** Vaihteluväli tulee joskus merkkijonona ("600-800") tai oliona
 *  ({min, max}); puuttuva väli täydennetään toEstimatessa arviosta. */
const range = z.preprocess((v) => {
  if (typeof v === 'string') {
    const parts = v.split(/[-–—]|\.\./).map((x) => toNumber(x.trim()))
    return parts.length === 2 ? parts : v
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    return [o.min ?? o.low, o.max ?? o.high]
  }
  return v
}, z.tuple([num, num]).nullish())

export const VisionResultSchema = z.object({
  items: z
    .array(z.object({
      name: z.string().min(1),
      grams: num.optional().default(0),
      kcal: num,
      protein_g: num.optional().default(0),
    }))
    .max(30),
  total_kcal: num,
  total_protein_g: num.optional().default(0),
  kcal_range: range,
  confidence,
  notes: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
})
export type VisionResult = z.infer<typeof VisionResultSchema>

/** Muoto jonka /api/ruoka-analysoi palauttaa selaimelle, tarjoajasta riippumatta. */
export interface MealEstimate {
  description: string
  /** Pelkät nimet — tallentuvat aterian `items`-kenttään hyväksynnän jälkeen. */
  items: string[]
  components: { name: string; grams: number; kcal: number; protein: number }[]
  calories: number
  protein: number
  kcalRange: [number, number]
  confidence: 'low' | 'medium' | 'high'
  notes: string
}

export class VisionError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

/** Rajat ja johdonmukaisuus: negatiivinen tai absurdi luku on virhe eikä
 *  arvio, ja vaihteluvälin on sisällettävä itse arvio. */
export function toEstimate(r: VisionResult, description?: string): MealEstimate {
  const components = r.items.slice(0, 12).map((i) => ({
    name: i.name.trim().slice(0, 60),
    grams: clamp(i.grams, 0, 3000),
    kcal: clamp(i.kcal, 0, 5000),
    protein: clamp(i.protein_g, 0, 400),
  }))
  const calories = clamp(r.total_kcal, 0, 5000)
  let [lo, hi] = (r.kcal_range ?? [calories * 0.75, calories * 1.25]).map((v) => clamp(v, 0, 8000)) as [number, number]
  if (lo > hi) [lo, hi] = [hi, lo]
  lo = Math.min(lo, calories)
  hi = Math.max(hi, calories)
  const names = components.map((c) => c.name)
  return {
    description: (description?.trim() || names.join(', ') || 'Ateria').slice(0, 80),
    items: names,
    components,
    calories,
    protein: clamp(r.total_protein_g, 0, 400),
    kcalRange: [lo, hi],
    confidence: r.confidence,
    notes: r.notes.trim().slice(0, 300),
  }
}

/** Mallin vastaus voi olla ```json-aidan sisällä tai saatteen keskellä —
 *  otetaan ensimmäisestä {:stä viimeiseen }:iin. */
export function parseVisionJson(text: string): VisionResult | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    console.warn('vision parse: no JSON object', text.length)
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    console.warn('vision parse: invalid JSON', text.length)
    return null
  }
  const parsed = VisionResultSchema.safeParse(raw)
  if (!parsed.success) {
    // Vain kenttäpolut ja koodit Vercelin lokiin, ei sisältöä: seuraava
    // muotovirhe on silloin jäljitettävissä ilman arvausta.
    console.warn('vision parse: schema', parsed.error.issues.map((i) => `${i.path.join('.')}:${i.code}`).join(' '))
    return null
  }
  return parsed.data
}

interface Deps {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get('retry-after'))
  if (!Number.isFinite(s) || s <= 0) return RATE_LIMIT_WAIT_MS
  return Math.min(s * 1000, RATE_LIMIT_WAIT_MAX_MS)
}

export async function analyseWithOpenRouter(opts: {
  apiKey: string
  /** Kokeilujärjestyksessä; OpenRouter siirtyy seuraavaan virheen tai ruuhkan sattuessa. */
  models: string[]
  imageDataUrl: string
  correction?: string
  deps?: Deps
}): Promise<MealEstimate> {
  const doFetch = opts.deps?.fetch ?? fetch
  const sleep = opts.deps?.sleep ?? defaultSleep
  let rateLimitRetried = false

  const body = JSON.stringify({
    model: opts.models[0],
    models: opts.models,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: OPENROUTER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: opts.correction
              ? `Käyttäjän korjaus aiempaan arvioon: "${opts.correction}". Päivitä arvio sen mukaan. Vastaa suomeksi.`
              : 'Arvioi ateria. Vastaa suomeksi.',
          },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
  })

  /** Yksi kutsu; 429 saa yhden uusinnan koko analyysin aikana. */
  async function call(): Promise<string> {
    for (;;) {
      const res = await doFetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
          'x-title': 'Friday',
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const json = (await res.json().catch(() => null)) as {
        error?: { code?: number; message?: string }
        choices?: { message?: { content?: unknown } }[]
      } | null

      // OpenRouter välittää ylävirran rate limitin joskus 200-vastauksen
      // error-kentässä, joten molemmat tulkitaan samoin.
      const limited = res.status === 429 || json?.error?.code === 429
      if (limited || !res.ok || json?.error) {
        // Vercelin lokiin syy, jotta "ruuhkautunut" on jäljitettävissä.
        // Vain tila ja OpenRouterin viesti — ei avainta eikä kuvaa.
        console.warn('openrouter error', res.status, json?.error?.code, json?.error?.message)
      }
      if (limited) {
        if (rateLimitRetried) throw new VisionError(429, RATE_LIMIT_MESSAGE)
        rateLimitRetried = true
        await sleep(res.status === 429 ? retryAfterMs(res) : RATE_LIMIT_WAIT_MS)
        continue
      }
      if (!res.ok || json?.error) {
        const detail = json?.error?.message ?? `HTTP ${res.status}`
        throw new VisionError(502, `Analyysi ei onnistunut: ${detail}`)
      }
      const content = json?.choices?.[0]?.message?.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
      }
      return ''
    }
  }

  // Muotovirhe saa yhden uuden yrityksen; toinen kerta on jo merkki siitä,
  // että malli ei tähän kuvaan tuota kelvollista vastausta.
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = parseVisionJson(await call())
    if (parsed) return toEstimate(parsed)
  }
  throw new VisionError(502, 'Analyysin muoto ei kelvannut kahdella yrityksellä. Kirjaa annos käsin.')
}
