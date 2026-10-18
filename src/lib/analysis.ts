// One place that decides "how is it going".
//
// The app used to answer that question three times on the same screen, from
// three different lenses, each with its own banner:
//
//   · position — is the trend weight above or below the target line today?
//   · rate     — is the weekly slope steeper or flatter than the plan asks?
//   · deficit  — do the logged calories add up to what the plan asked so far?
//
// All three are legitimate, and they routinely disagree without either being
// wrong: banking a fast first fortnight puts you *below* the line while your
// *current* slope has already flattened. Shown as three verdicts stacked on
// one screen, that reads as the app contradicting itself.
//
// So the lenses stay — they measure different things and each is worth
// knowing — but they no longer each get a verdict. They feed one headline
// that names the state and the direction in the same breath, and the detail
// cards below it explain each lens separately.

import type { ComputedResult, Settings, WeightTrend } from '../types'
import { getActiveGoal, getActivePeriod } from './goalPeriods'
import type { ActiveGoal } from './goalPeriods'
import { interpretTrend } from './trendStatus'
import { addDays } from './dates'
import { eligibleDayCount } from './compensation'

// Position: kg above (+) or below (−) the linear target line today.
const POS_OK = 0.3
const POS_MODERATE = 1.0
// Rate: how far kg/week may sit from the pace the period asks for. A flat
// absolute band is wrong at both ends — 0.2 kg/wk is a rounding error against
// a 1.0 kg/wk bulk and more than half the plan against a gentle 0.35 kg/wk
// cut, where it would call a pace of −0.14 "on target". So the band is a share
// of the target, with a floor for targets near zero (maintenance).
const RATE_FLOOR = 0.1
const RATE_SHARE = 0.3
const rateTolerance = (target: number) => Math.max(RATE_FLOOR, Math.abs(target) * RATE_SHARE)
// Cumulative deficit: kcal/day away from what the plan asked of the days done.
const KCAL_OK = 100
const KCAL_MODERATE = 300

export type Standing = 'ahead' | 'on-track' | 'slightly-behind' | 'behind'
export type Tone = 'ok' | 'info' | 'warn' | 'danger'

export interface Recovery {
  kind: 'tighten' | 'loosen'
  /** Mistä ero on luettu.
   *
   *  'weight' = trendipaino on tavoitelinjan yläpuolella. 'kcal' = kirjattu
   *  vaje on jäljessä siitä mitä suunnitelma pyysi. Paino voittaa kun molemmat
   *  puhuvat, koska paino on lopputulos ja kirjatut kalorit arvio syötteestä:
   *  punnitus voi olla kiusallinen mutta se ei ole arvattu, kun taas annoskoko
   *  on. Käytännössä juuri tämä pari eri mieltä on tavallisin tilanne —
   *  kaloritase näyttää menevän putkeen mutta paino ei liiku — ja silloin
   *  kaloreita uskomalla ei tehdä mitään. */
  source: 'weight' | 'kcal'
  /** kcal/day on top of (or off) the plan. */
  extraPerDay: number
  daysNeeded: number
  /** Tasoitus osuu vain arkipäiviin, koska jaksolla on viikonloppuylläpito.
   *  `daysNeeded` on silloin arkipäivien määrä, ei kalenteripäivien. */
  weekdaysOnly: boolean
  /** What this plan actually rolls out: extraPerDay × daysNeeded. Equal to
   *  gapKcal when the gap is reachable, and less when it is not — the card
   *  and the rollout must promise the same number. */
  totalKcal: number
  /** The full size of the gap, which may exceed what the plan can cover. */
  gapKcal: number
  /** False when even the cap over every remaining day cannot close the gap. */
  achievable: boolean
}

export interface HeadlineLine {
  /** Short row label, e.g. "Sijainti" / "Vauhti" / "Toimi". */
  label: string
  text: string
}

export interface Headline {
  tone: Tone
  title: string
  lines: HeadlineLine[]
}

export interface Analysis {
  goal: ActiveGoal
  /** Enough weigh-ins for the weight lenses (position, rate). */
  hasWeightData: boolean
  /** Enough logged days for the deficit lens. */
  hasDeficitData: boolean

  // ── position ──
  currentTrend: number | null
  expectedWeightToday: number
  positionGapKg: number
  positionStanding: Standing
  remainingKg: number

  // ── rate ──
  weeklyChange: number | null
  targetWeeklyChange: number
  rateGap: number
  rateStanding: Standing
  /** Date the goal weight is reached at the current pace, null if not falling. */
  projectedDate: string | null

  // ── cumulative deficit ──
  cumulativePoints: Array<{ date: string; cum: number }>
  actualCum: number
  expectedCum: number
  gapKcal: number
  gapPerDay: number
  avgPerDayActual: number
  /** What the plan asked of exactly the days that have been logged. */
  plannedPerDayDone: number
  remainingTotal: number
  daysLeft: number
  deficitStanding: Standing

  recovery: Recovery | null
  headline: Headline
}

const RECOVERY_TARGET_DAYS = 14
const RECOVERY_MAX_EXTRA = 200
const RECOVERY_STEP = 25

function positionStanding(gap: number): Standing {
  if (gap < -POS_OK) return 'ahead'
  if (Math.abs(gap) <= POS_OK) return 'on-track'
  if (gap <= POS_MODERATE) return 'slightly-behind'
  return 'behind'
}

function rateStandingFor(gap: number, target: number): Standing {
  // gap = actual − target, both negative-for-loss. Positive gap = flatter than
  // asked = behind. Negative = steeper than asked = ahead of pace.
  const tol = rateTolerance(target)
  if (gap < -tol) return 'ahead'
  if (Math.abs(gap) <= tol) return 'on-track'
  if (gap <= tol * 3) return 'slightly-behind'
  return 'behind'
}

function deficitStandingFor(gapPerDay: number): Standing {
  if (gapPerDay < -KCAL_OK) return 'ahead'
  if (Math.abs(gapPerDay) <= KCAL_OK) return 'on-track'
  if (gapPerDay <= KCAL_MODERATE) return 'slightly-behind'
  return 'behind'
}

const kg = (n: number) => `${Math.abs(n).toFixed(1)} kg`
const rate = (n: number) => {
  const v = Math.abs(n) < 0.005 ? 0 : n
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} kg/vko`
}

/** Combine the position lens (where you are) and the rate lens (which way
 *  you're heading) into a single verdict. These two disagreeing is the normal
 *  case, not an error — the headline is built to say both at once. */
function buildHeadline(
  pos: Standing,
  rateSt: Standing,
  positionGapKg: number,
  weeklyChange: number | null,
  targetWeekly: number,
  requiredDailyDeficit: number,
  hasWeightData: boolean,
  hasRecovery: boolean,
  /** Arkipäivän oma tarve, kun viikonloput ovat ylläpidolla. Null muuten. */
  requiredWeekdayDeficit: number | null,
): Headline {
  if (!hasWeightData || weeklyChange === null) {
    return {
      tone: 'info',
      title: 'Ei tarpeeksi dataa',
      lines: [
        { label: 'Sijainti', text: 'Tarvitaan vähintään 4 painokirjausta ennen kuin sijainti tavoitelinjalla voidaan laskea.' },
        { label: 'Vauhti', text: 'Viikkotahti vaatii noin kahden viikon kirjaushistorian.' },
        { label: 'Toimi', text: 'Kirjaa aamupaino muutamana päivänä lisää.' },
      ],
    }
  }

  const positionText =
    pos === 'ahead'
      ? `Olet ${kg(positionGapKg)} tavoitelinjan alapuolella — edellä aikataulua.`
      : pos === 'on-track'
        ? `Olet tavoitelinjalla (${kg(positionGapKg)} ero, toleranssi 0,3 kg).`
        : `Olet ${kg(positionGapKg)} tavoitelinjan yläpuolella — jäljessä aikataulua.`

  const rateText =
    rateSt === 'ahead'
      ? `Vauhti ${rate(weeklyChange)} on nopeampi kuin tavoite ${rate(targetWeekly)}.`
      : rateSt === 'on-track'
        ? `Vauhti ${rate(weeklyChange)} on tavoitteen ${rate(targetWeekly)} toleranssissa.`
        : `Vauhti ${rate(weeklyChange)} on hitaampi kuin tavoite ${rate(targetWeekly)}.`

  // Viikonloppuylläpidolla keskiarvo kaikille päiville on luku jota yksikään
  // päivä ei koskaan pyydä: viikonloput on jätetty vajeettomiksi, joten koko
  // loppuajan tarve kannetaan arkipäivillä. Pelkkä keskiarvo olisi
  // kohtuullisen kuuloinen numero joka aliarvioi sen mitä maanantailta
  // oikeasti pyydetään, joten arkipäivän oma luku sanotaan ääneen.
  const needed = requiredWeekdayDeficit !== null
    ? `Loppuajan tarve ${Math.round(requiredWeekdayDeficit)} kcal arkipäivää kohden, viikonloput ylläpidolla.`
    : `Loppuajan tarve ${Math.round(requiredDailyDeficit)} kcal/pv.`
  // "Alta" lupaa kortin. Ilman tätä otsikko kehotti jalkauttamaan tasoituksen
  // silloinkin kun tasoitusta ei ollut tarjolla, ja sen alta ei löytynyt
  // mitään — kehotus johonkin mitä ei ole on pahempi kuin kehotuksen puute.
  const rollout = hasRecovery ? 'Jalkauta tasoitus alta. ' : ''
  const rateOk = rateSt === 'ahead' || rateSt === 'on-track'
  const posOk = pos === 'ahead' || pos === 'on-track'

  // The four quadrants. The two mixed ones are the cases that used to show up
  // as two banners arguing with each other.
  const wrap = (tone: Tone, title: string, action: string): Headline => ({
    tone,
    title,
    lines: [
      { label: 'Sijainti', text: positionText },
      { label: 'Vauhti', text: rateText },
      { label: 'Toimi', text: action },
    ],
  })

  if (posOk && rateOk) {
    return wrap('ok', pos === 'ahead' ? 'Edellä tavoitetta' : 'Oikealla radalla', `Jatka samaan malliin. ${needed}`)
  }
  if (posOk && !rateOk) {
    return wrap(
      'info',
      pos === 'ahead' ? 'Edellä tavoitetta, mutta vauhti hidastunut' : 'Linjalla, mutta vauhti hidastunut',
      pos === 'ahead'
        ? `Etumatka riittää toistaiseksi, joten kiirettä ei ole — mutta jos tahti pysyy tässä, etumatka kuluu umpeen. ${needed}`
        : `Ei vielä eroa linjaan, mutta suunta vie sinne. Tiukenna hieman ennen kuin ero syntyy. ${needed}`,
    )
  }
  if (!posOk && rateOk) {
    return wrap(
      'info',
      'Jäljessä, mutta kurot kiinni',
      `Nykyinen vauhti riittää tavoitetahtiin, mutta ei kuro syntynyttä eroa umpeen. ${rollout}${needed}`,
    )
  }
  return wrap(
    pos === 'behind' ? 'danger' : 'warn',
    pos === 'behind' ? 'Selkeästi jäljessä' : 'Jäljessä ja vauhti liian hidas',
    `Sekä sijainti että vauhti vievät väärään suuntaan. ${rollout}${needed}`,
  )
}

interface Inputs {
  settings: Settings
  computed: ComputedResult
  trend: WeightTrend
  today: string
}

export function buildAnalysis({ settings, computed, trend, today }: Inputs): Analysis {
  const goal = getActiveGoal(settings, today)
  const hasWeightData = trend.trendData.length >= 4 && trend.currentTrend !== null

  // ── position ──
  const currentTrend = trend.currentTrend
  const progressed = goal.totalDays > 0 ? goal.elapsedDays / goal.totalDays : 0
  const expectedWeightToday = goal.startWeight - goal.kgToChange * Math.min(1, progressed)
  const positionGapKg = currentTrend !== null ? currentTrend - expectedWeightToday : 0
  const remainingKg = currentTrend !== null ? Math.max(0, currentTrend - goal.targetWeight) : goal.kgToChange

  // ── rate ──
  const weeklyChange = trend.weeklyChange
  const targetWeeklyChange = -goal.weeklyRateKg
  const rateGap = weeklyChange !== null ? weeklyChange - targetWeeklyChange : 0

  const daysLeft = Math.max(0, goal.remainingDays)
  const requiredDailyDeficit = daysLeft > 0 ? (remainingKg * 7700) / daysLeft : 0

  let projectedDate: string | null = null
  if (weeklyChange !== null && weeklyChange < -0.01 && remainingKg > 0) {
    const weeksNeeded = remainingKg / Math.abs(weeklyChange)
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() + Math.round(weeksNeeded * 7))
    projectedDate = d.toISOString().slice(0, 10)
  }

  // ── cumulative deficit ──
  const cumulativePoints: Array<{ date: string; cum: number }> = []
  let cum = 0
  const doneDays = computed.days.filter(
    (d) => d.date <= today && d.actualDeficit !== undefined && d.actualDeficit !== null,
  )
  for (const d of doneDays) {
    cum += d.actualDeficit ?? 0
    cumulativePoints.push({ date: d.date, cum })
  }
  const actualCum = cum
  const hasDeficitData = doneDays.length > 0
  // What the plan asked of exactly these days. With weekendMaintenance the
  // plan is uneven, so the period average is the wrong yardstick for a partial
  // stretch of days.
  const plannedPerDayDone = hasDeficitData
    ? doneDays.reduce((s, d) => s + d.dailyDeficitBase, 0) / doneDays.length
    : computed.dailyDeficitBase
  const expectedCum = doneDays.reduce((s, d) => s + d.dailyDeficitBase, 0)
  const gapKcal = expectedCum - actualCum
  const gapPerDay = doneDays.length > 0 ? gapKcal / doneDays.length : 0
  const avgPerDayActual = doneDays.length > 0 ? actualCum / doneDays.length : 0
  const remainingTotal = computed.totalDeficitTarget - actualCum

  const deficitStanding = deficitStandingFor(gapPerDay)
  const posSt = positionStanding(positionGapKg)
  const rateSt = rateStandingFor(rateGap, targetWeeklyChange)

  // ── recovery plan ──
  //
  // Kaksi lukua voi kertoa erosta, ja ne ovat usein eri mieltä. Paino luetaan
  // ensin: se on lopputulos, kun taas kirjattu vaje on arvio syötteestä.
  // Aiemmin tasoitusta tarjottiin vain kalorieron perusteella, joten juuri se
  // tilanne jossa kaloritase näyttää putkeen menevältä mutta paino on linjan
  // yläpuolella — tämän työkalun tavallisin tilanne — jäi ilman mitään mitä
  // tehdä. Otsikko jopa kehotti jalkauttamaan tasoituksen "alta", eikä siellä
  // ollut mitään.
  let recovery: Recovery | null = null
  const posBehind = posSt === 'slightly-behind' || posSt === 'behind'
  const weekdaysOnly = goal.weekendMaintenance
  // Tasoitus jaetaan huomisesta jakson loppuun: "loput blokista" on se mihin
  // ero on kurottava, eikä mikään lyhyempi ikkuna ole sen oikeampi.
  const rolloutFrom = addDays(today, 1)
  const eligibleLeft = eligibleDayCount(rolloutFrom, goal.endDate, weekdaysOnly)

  if (hasWeightData && posBehind && eligibleLeft > 0) {
    const magnitude = Math.round(positionGapKg * 7700)
    const ideal = magnitude / eligibleLeft
    const capped = Math.min(RECOVERY_MAX_EXTRA, Math.max(25, Math.round(ideal)))
    recovery = {
      kind: 'tighten',
      source: 'weight',
      extraPerDay: capped,
      daysNeeded: eligibleLeft,
      weekdaysOnly,
      totalKcal: capped * eligibleLeft,
      gapKcal: magnitude,
      achievable: ideal <= RECOVERY_MAX_EXTRA,
    }
  } else if (hasDeficitData && deficitStanding !== 'on-track' && daysLeft > 0) {
    const magnitude = Math.abs(gapKcal)
    const ideal = magnitude / RECOVERY_TARGET_DAYS
    let extraPerDay = Math.min(
      RECOVERY_MAX_EXTRA,
      Math.max(50, Math.ceil(ideal / RECOVERY_STEP) * RECOVERY_STEP),
    )
    let daysNeeded = Math.max(1, Math.ceil(magnitude / extraPerDay))
    // Viikonloppuylläpidolla käytettävissä on vain arkipäiviä: säätö
    // viikonlopulle purkaisi juuri sen päätöksen jonka jakso on tehnyt.
    const roomLeft = weekdaysOnly ? eligibleLeft : daysLeft
    const achievable = daysNeeded <= roomLeft
    if (!achievable && deficitStanding !== 'ahead') {
      extraPerDay = RECOVERY_MAX_EXTRA
      daysNeeded = roomLeft
    }
    const cappedDays = Math.max(1, Math.min(daysNeeded, roomLeft))
    recovery = {
      kind: deficitStanding === 'ahead' ? 'loosen' : 'tighten',
      source: 'kcal',
      extraPerDay,
      daysNeeded: cappedDays,
      weekdaysOnly,
      totalKcal: extraPerDay * cappedDays,
      gapKcal: Math.round(magnitude),
      achievable,
    }
  }

  return {
    goal,
    hasWeightData,
    hasDeficitData,
    currentTrend,
    expectedWeightToday,
    positionGapKg,
    positionStanding: posSt,
    remainingKg,
    weeklyChange,
    targetWeeklyChange,
    rateGap,
    rateStanding: rateSt,
    projectedDate,
    cumulativePoints,
    actualCum,
    expectedCum,
    gapKcal,
    gapPerDay,
    avgPerDayActual,
    plannedPerDayDone,
    remainingTotal,
    daysLeft,
    deficitStanding,
    recovery,
    headline: headlineFor({
      settings,
      today,
      goal,
      trend,
      posSt,
      rateSt,
      positionGapKg,
      weeklyChange,
      targetWeeklyChange,
      requiredDailyDeficit,
      hasWeightData,
      hasRecovery: recovery !== null,
      requiredWeekdayDeficit:
        weekdaysOnly && eligibleLeft > 0 && daysLeft > 0
          ? (requiredDailyDeficit * daysLeft) / eligibleLeft
          : null,
    }),
  }
}

/** Which lens gets to write the headline depends on the period type.
 *
 *  A cut or a bulk is a journey along a line, so "where am I on it" and "how
 *  fast am I moving" are the right two questions. A maintenance or refill
 *  period has no line to be ahead of — the whole point of a refill is that
 *  weight rises and then stops, and measuring that against a downward target
 *  line would report a disaster every time. Those periods are judged on shape
 *  instead, by lib/trendStatus, which knows the difference between a refill
 *  plateauing on schedule and eating that simply never stops. */
function headlineFor(i: {
  settings: Settings
  today: string
  goal: ActiveGoal
  trend: WeightTrend
  posSt: Standing
  rateSt: Standing
  positionGapKg: number
  weeklyChange: number | null
  targetWeeklyChange: number
  requiredDailyDeficit: number
  hasWeightData: boolean
  hasRecovery: boolean
  requiredWeekdayDeficit: number | null
}): Headline {
  if (i.goal.type === 'cut' || i.goal.type === 'bulk') {
    return buildHeadline(
      i.posSt,
      i.rateSt,
      i.positionGapKg,
      i.weeklyChange,
      i.targetWeeklyChange,
      i.requiredDailyDeficit,
      i.hasWeightData,
      i.hasRecovery,
      i.requiredWeekdayDeficit,
    )
  }

  const period = getActivePeriod(i.settings, i.today)
  if (!period) {
    return { tone: 'info', title: 'Ei aktiivista jaksoa', lines: [] }
  }
  const r = interpretTrend({ period, trend: i.trend, today: i.today })
  return {
    tone: r.tone,
    title: r.title,
    lines: [
      { label: 'Tilanne', text: r.body },
      {
        label: 'Vauhti',
        text:
          i.weeklyChange === null
            ? 'Viikkotahti vaatii noin kahden viikon kirjaushistorian.'
            : `Trendi liikkuu ${rate(i.weeklyChange)}.`,
      },
    ],
  }
}
