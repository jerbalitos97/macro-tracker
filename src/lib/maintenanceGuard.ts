// Ylläpidon vahti.
//
// Cutin jälkeen paino palaa hitaasti, ja se huomataan yleensä vasta kun
// palattavaa on kilon verran. Vahti katsoo viikkokeskiarvoja ankkuria vastaan
// ja sanoo, milloin kannattaa puuttua.
//
// Kolme sääntöä, jotka ovat tässä siksi että ilman niitä vahti olisi
// haitallinen eikä hyödyllinen:
//
//   • Se EHDOTTAA. Mitään ei sovelleta itsestään. Vaje on asia josta ihminen
//     päättää; automaattisesti ilmestyvä miinusmerkki opettaa vain sivuuttamaan
//     sovelluksen.
//   • Vajaa viikko ei laukaise EIKÄ nollaa. Neljää harvempi punnitus on liian
//     ohut otos kummallekin päätökselle, ja jos vajaa viikko nollaisi putken,
//     yksi kiireinen viikko pyyhkisi kahden viikon havainnon.
//   • Yksi päivä ei ratkaise mitään. Vahti lukee vain kokonaisia maanantai–
//     sunnuntai-viikkoja, joten yksittäinen suolainen ateria ei näy täällä
//     lainkaan.
//
// InBody ei ole syöte. Rasvaprosentti liikkuu mittauksesta toiseen enemmän
// kuin viikon painokeskiarvo, ja sen varaan rakennettu hälytys soisi väärin.
//
// Treenikulutusta ei lasketa mukaan mihinkään täällä. Vahti katsoo painoa,
// joka on jo kaiken kulutuksen lopputulos — kulutuksen lisääminen erikseen
// laskisi saman asian kahdesti.

import { addDays, daysBetween, getWeekdayNum, toISO } from './dates'
import type { WeightEntry } from '../types'

export interface GuardSettings {
  enabled: boolean
  /** Ankkuriviikon maanantai. Ensimmäinen täysi viikko cutin jälkeen. */
  anchorWeekStart: string
  /** Käsin asetettu ankkuri. Null = laske ankkuriviikon keskiarvosta. */
  anchorKg: number | null
  minWeighInsPerWeek: number
  triggerThresholdKg: number
  triggerConsecutiveWeeks: number
  suggestKcalPerDay: number
  /** Viikonpäivät joille vaje ehdotetaan. 0 = sunnuntai. */
  suggestDays: number[]
  /** Kuinka suuri osa palautettavasta painosta oletetaan rasvaksi
   *  paluuennusteessa. 1.0 on tahallaan pessimistinen: se antaa pisimmän
   *  arvion, ja liian lyhyt lupaus on pahempi kuin liian pitkä. */
  fatFraction: number
  exitToleranceKg: number
  /** Viimeisin viikko jonka ehdotus on ohitettu. Ohitus koskee sitä havaintoa
   *  eikä koko vahtia: seuraava kokonainen viikko kysyy uudestaan. Tämä on
   *  käyttöliittymän tieto eikä arvion, joten `evaluateGuard` ei katso sitä —
   *  se kertoo mikä tilanne on, ei mitä siitä on jo sanottu. */
  dismissedThroughWeek?: string
  /** Viimeisimmät tapahtumat, uusin ensin. Asetuksissa eikä omassa taulussaan,
   *  koska asetukset synkkaavat ja päätyvät vientiin valmiiksi. */
  log?: GuardLogEntry[]
}

export interface GuardLogEntry {
  at: string
  kind: 'trigger' | 'accept' | 'dismiss' | 'exit'
  /** Ihmisen luettava perustelu lukuineen. */
  note: string
  anchorKg: number
  avgKg: number
}

export const GUARD_DEFAULTS: GuardSettings = {
  enabled: true,
  anchorWeekStart: '2026-11-09',
  anchorKg: null,
  minWeighInsPerWeek: 4,
  triggerThresholdKg: 1.0,
  triggerConsecutiveWeeks: 2,
  suggestKcalPerDay: 250,
  suggestDays: [1, 2, 3, 4, 5],
  fatFraction: 1.0,
  exitToleranceKg: 0.0,
}

export function guardSettings(raw?: Partial<GuardSettings>): GuardSettings {
  return { ...GUARD_DEFAULTS, ...(raw ?? {}) }
}

/** Enintään tämän verran tapahtumia säilytetään. Lokin tehtävä on kertoa mitä
 *  viime kuukausina tapahtui, ei olla arkisto. */
export const LOG_LIMIT = 50

export interface WeekRow {
  start: string
  end: string
  weighIns: number
  avgKg: number | null
  /** Riittävästi punnituksia ollakseen todistusvoimainen. */
  valid: boolean
  /** Paljonko keskiarvo ylittää ankkurin. Null kelvottomalla viikolla. */
  overAnchorKg: number | null
}

export type GuardState =
  | 'off'            // kytkin pois
  | 'before-anchor'  // ankkuriviikko ei ole vielä alkanut
  | 'no-anchor'      // ankkuriviikko meni ohi liian harvalla punnituksella
  | 'ok'             // paino on ankkurin tuntumassa
  | 'watching'       // yksi kelvollinen viikko rajan yli, ei vielä tarpeeksi
  | 'trigger'        // raja ylittynyt vaaditut viikot peräkkäin
  | 'exit'           // palattu ankkuriin, vaje voi poistua

export interface Suggestion {
  kcalPerDay: number
  days: number[]
  /** Montako viikkoa paluu kestää tällä vajeella. */
  weeksToReturn: number
  excessKg: number
}

export interface GuardVerdict {
  state: GuardState
  anchorKg: number | null
  /** Viimeisin kelvollinen viikkokeskiarvo. */
  latestAvgKg: number | null
  /** Kokonaiset viikot ankkuriviikon jälkeen, vanhin ensin. */
  weeks: WeekRow[]
  /** Monta kelvollista viikkoa putkeen rajan yli juuri nyt. */
  streak: number
  suggestion: Suggestion | null
  /** Yhden lauseen selitys, sellaisena kuin se käyttöliittymässä luetaan. */
  reason: string
}

/** Viikon maanantai. */
function mondayOf(iso: string): string {
  const dow = getWeekdayNum(iso)
  return addDays(iso, dow === 0 ? -6 : 1 - dow)
}

function weekRow(
  entries: WeightEntry[],
  start: string,
  minWeighIns: number,
  anchorKg: number | null,
): WeekRow {
  const end = addDays(start, 6)
  const inWeek = entries.filter((w) => !w.excludeFromTrend && w.date >= start && w.date <= end)
  const avg = inWeek.length > 0 ? inWeek.reduce((s, w) => s + Number(w.kg), 0) / inWeek.length : null
  const valid = inWeek.length >= minWeighIns && avg !== null
  return {
    start,
    end,
    weighIns: inWeek.length,
    avgKg: avg,
    valid,
    overAnchorKg: valid && anchorKg !== null && avg !== null ? avg - anchorKg : null,
  }
}

/**
 * @param deficitActive onko vahdin ehdottama vaje parhaillaan käytössä. Vain
 *        silloin paluu on uutinen: ilman voimassa olevaa vajetta "olet
 *        ankkurissa" on normaalitila eikä toimenpide.
 */
export function evaluateGuard(
  raw: Partial<GuardSettings> | undefined,
  weights: WeightEntry[],
  today: string = toISO(new Date()),
  deficitActive = false,
): GuardVerdict {
  const s = guardSettings(raw)
  const empty: GuardVerdict = {
    state: 'off', anchorKg: null, latestAvgKg: null, weeks: [], streak: 0,
    suggestion: null, reason: 'Vahti ei ole käytössä.',
  }
  if (!s.enabled) return empty

  const anchorStart = mondayOf(s.anchorWeekStart)
  if (today < addDays(anchorStart, 6)) {
    return {
      ...empty, state: 'before-anchor',
      reason: `Ankkuriviikko ${anchorStart} – ${addDays(anchorStart, 6)} on vielä kesken.`,
    }
  }

  const anchorWeek = weekRow(weights, anchorStart, s.minWeighInsPerWeek, null)
  const anchorKg = s.anchorKg ?? (anchorWeek.valid ? anchorWeek.avgKg : null)
  if (anchorKg === null) {
    return {
      ...empty, state: 'no-anchor', weeks: [anchorWeek],
      reason: `Ankkuriviikolla oli ${anchorWeek.weighIns} punnitusta, tarvitaan ${s.minWeighInsPerWeek}. Aseta ankkuri käsin.`,
    }
  }

  // Vain kokonaiset viikot. Kesken oleva viikko ei ole havainto vaan puolikas.
  const weeks: WeekRow[] = []
  for (let start = addDays(anchorStart, 7); daysBetween(start, today) >= 6; start = addDays(start, 7)) {
    weeks.push(weekRow(weights, start, s.minWeighInsPerWeek, anchorKg))
  }

  const valids = weeks.filter((w) => w.valid)
  const latestAvgKg = valids.length > 0 ? valids[valids.length - 1].avgKg : null

  // Putki lasketaan lopusta taaksepäin. Kelvoton viikko ohitetaan kokonaan:
  // se ei katkaise putkea eikä kasvata sitä.
  let streak = 0
  for (let i = valids.length - 1; i >= 0; i--) {
    if ((valids[i].overAnchorKg ?? 0) > s.triggerThresholdKg) streak++
    else break
  }

  const base = { anchorKg, latestAvgKg, weeks, streak }

  if (valids.length === 0) {
    return {
      ...base, state: 'ok', suggestion: null,
      reason: `Ankkuri ${anchorKg.toFixed(1)} kg. Yhtään kokonaista viikkoa ei ole vielä mitattu riittävän tiheästi.`,
    }
  }

  if (deficitActive && latestAvgKg !== null && latestAvgKg <= anchorKg + s.exitToleranceKg) {
    return {
      ...base, state: 'exit', suggestion: null,
      reason: `Viikkokeskiarvo ${latestAvgKg.toFixed(1)} kg on takaisin ankkurissa (${anchorKg.toFixed(1)} kg). Vaje voi poistua.`,
    }
  }

  if (streak >= s.triggerConsecutiveWeeks && latestAvgKg !== null) {
    const excessKg = latestAvgKg - anchorKg
    const perWeek = s.suggestKcalPerDay * Math.max(1, s.suggestDays.length)
    const weeksToReturn = (excessKg * 7700 * s.fatFraction) / perWeek
    return {
      ...base, state: 'trigger',
      suggestion: {
        kcalPerDay: s.suggestKcalPerDay,
        days: s.suggestDays,
        weeksToReturn,
        excessKg,
      },
      reason: `${streak} kelvollista viikkoa peräkkäin yli rajan: ${latestAvgKg.toFixed(1)} kg vs ankkuri ${anchorKg.toFixed(1)} kg (+${excessKg.toFixed(1)}).`,
    }
  }

  if (streak > 0) {
    return {
      ...base, state: 'watching', suggestion: null,
      reason: `${streak}/${s.triggerConsecutiveWeeks} viikkoa rajan yli. Yksi viikko ei vielä ratkaise.`,
    }
  }

  return {
    ...base, state: 'ok', suggestion: null,
    reason: latestAvgKg !== null
      ? `Viikkokeskiarvo ${latestAvgKg.toFixed(1)} kg, ankkuri ${anchorKg.toFixed(1)} kg.`
      : `Ankkuri ${anchorKg.toFixed(1)} kg.`,
  }
}

/** Tunniste jolla vahdin tekemät säädöt tunnistetaan omikseen. Sama tapa kuin
 *  tasoituksella (`komp:`): merkintä kulkee muistiinpanossa, jolloin "onko vaje
 *  voimassa" vastataan katsomalla säätöjä eikä erillistä tilaa. Säädön poisto
 *  poistaa vajeen, mikä on juuri se mitä poistaminen tarkoittaa. */
export const GUARD_TAG = 'vahti'

export function isGuardAdjustment(note: string | undefined): boolean {
  return (note ?? '').includes(GUARD_TAG)
}

/** Päivät joille vahdin vaje kirjoitetaan: `days`-viikonpäivät `from`-päivästä
 *  eteenpäin `weeks` viikon ajan. */
export function guardAdjustmentDates(from: string, days: number[], weeks: number): string[] {
  const out: string[] = []
  const total = Math.max(1, Math.round(weeks * 7))
  for (let i = 0; i < total; i++) {
    const d = addDays(from, i)
    if (days.includes(getWeekdayNum(d))) out.push(d)
  }
  return out
}

export function appendLog(s: GuardSettings, entry: GuardLogEntry): GuardSettings {
  return { ...s, log: [entry, ...(s.log ?? [])].slice(0, LOG_LIMIT) }
}
