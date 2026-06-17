import { useMemo, useState } from 'react'
import type { ComputedResult, Settings, WeightEntry } from '../types'
import { computeWeightTrend } from '../lib/weight'
import { daysBetween, toISO, addDays, fromISO } from '../lib/dates'
import { getPeriods, getActivePeriod } from '../lib/goalPeriods'
import { interpretTrend } from '../lib/trendStatus'
import { GoalChart } from '../components/GoalChart'
import { DeficitChart } from '../components/DeficitChart'
import { Card, Button, Sheet } from '../components/ui'

// ── Recommendation thresholds ────────────────────────────────
// Weight analysis is position-based:
//   positionGap = currentTrend − expectedWeightOnTargetLine (kg)
//   positive gap → above the line (behind), negative → below (ahead)
const POS_THRESHOLD_OK = 0.3       // ±0.3 kg → on track
const POS_THRESHOLD_MOD = 1.0      // 0.3 – 1.0 kg → slightly off
//                                   > 1.0 → significantly off

// Cumulative deficit analysis still uses kcal/day gap thresholds.
const THRESHOLD_CLOSE = 100
const THRESHOLD_MODERATE = 300

type Recommendation = 'on-track' | 'tighten-slightly' | 'tighten-significantly' | 'loosen'

interface Props {
  settings: Settings
  weights: WeightEntry[]
  computed: ComputedResult
}

export function GoalView({ settings, weights, computed }: Props) {
  const trend = useMemo(() => computeWeightTrend(weights), [weights])

  const todayISO = toISO(new Date())
  const periods = useMemo(() => getPeriods(settings), [settings])
  const activePeriod = useMemo(() => getActivePeriod(settings, todayISO), [settings, todayISO])
  const trendStatus = useMemo(
    () => (activePeriod ? interpretTrend({ period: activePeriod, trend, today: todayISO }) : null),
    [activePeriod, trend, todayISO],
  )

  const analysis = useMemo(() => {
    const { currentTrend, weeklyChange, trendData } = trend
    if (currentTrend === null || trendData.length < 4) return null

    const totalCutDays = daysBetween(settings.startDate, settings.endDate)
    const elapsedCutDays = Math.max(0, Math.min(totalCutDays, daysBetween(settings.startDate, todayISO)))
    const remainingDays = Math.max(0, totalCutDays - elapsedCutDays)
    if (remainingDays <= 0) return null

    // Position-based: linear ramp from startWeight to targetWeight across the cut.
    // Where SHOULD you be today, and where ARE you (current trend value)?
    const totalKgChange = settings.startWeight - settings.targetWeight  // positive = need to lose
    const expectedWeightToday =
      totalCutDays > 0
        ? settings.startWeight - totalKgChange * (elapsedCutDays / totalCutDays)
        : settings.startWeight
    const positionGap = currentTrend - expectedWeightToday   // + = above line (behind), − = below (ahead)
    const remainingKg = Math.max(0, currentTrend - settings.targetWeight)

    // Recommendation from position gap. Loosen only when meaningfully below the line.
    let recommendation: Recommendation
    if (Math.abs(positionGap) <= POS_THRESHOLD_OK) recommendation = 'on-track'
    else if (positionGap < -POS_THRESHOLD_OK) recommendation = 'loosen'
    else if (positionGap <= POS_THRESHOLD_MOD) recommendation = 'tighten-slightly'
    else recommendation = 'tighten-significantly'

    // Rate context (still computed for the recommendation body + ProjectedDateCard)
    const requiredDailyDeficit = (remainingKg * 7700) / remainingDays
    const requiredWeeklyKg = (requiredDailyDeficit * 7) / 7700
    const actualDailyDeficit = weeklyChange !== null ? (-weeklyChange * 7700) / 7 : null
    const actualWeeklyKg = weeklyChange

    // Projected goal date at current pace
    let projectedDate: string | null = null
    if (weeklyChange !== null && weeklyChange < -0.01) {
      const weeksNeeded = remainingKg / Math.abs(weeklyChange)
      projectedDate = addDays(todayISO, Math.round(weeksNeeded * 7))
    }

    return {
      currentTrend,
      expectedWeightToday,
      positionGap,
      remainingKg,
      remainingDays,
      requiredDailyDeficit,
      requiredWeeklyKg,
      actualDailyDeficit,
      actualWeeklyKg,
      projectedDate,
      recommendation,
    }
  }, [trend, settings, todayISO])

  // Progress along the cut (days elapsed / total days)
  const totalDays = daysBetween(settings.startDate, settings.endDate)
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(settings.startDate, todayISO)))
  const progressPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0

  const notEnoughData = trend.trendData.length < 4 || trend.weeklyChange === null

  // ── Cumulative deficit analysis ──────────────────────────────
  const deficit = useMemo(() => {
    const cumulativePoints: Array<{ date: string; cum: number }> = []
    let cum = 0
    for (const d of computed.days) {
      if (d.actualDeficit !== undefined && d.date <= todayISO) {
        cum += d.actualDeficit
        cumulativePoints.push({ date: d.date, cum })
      }
    }

    if (cumulativePoints.length === 0) {
      return { cumulativePoints, hasData: false as const }
    }

    const actualCum = cum
    const expectedCum = computed.dailyDeficitBase * elapsedDays
    const gap = expectedCum - actualCum  // + = behind, − = ahead
    const gapPerDay = elapsedDays > 0 ? gap / elapsedDays : 0
    const avgPerDayActual = elapsedDays > 0 ? actualCum / elapsedDays : 0
    const remainingTotal = computed.totalDeficitTarget - actualCum
    const daysLeft = Math.max(0, totalDays - elapsedDays)

    let recommendation: Recommendation
    if (Math.abs(gapPerDay) <= THRESHOLD_CLOSE) recommendation = 'on-track'
    else if (gapPerDay < -THRESHOLD_CLOSE) recommendation = 'loosen'
    else if (gapPerDay <= THRESHOLD_MODERATE) recommendation = 'tighten-slightly'
    else recommendation = 'tighten-significantly'

    // Recovery suggestion: how much extra deficit/day for how many days closes
    // the cumulative shortfall. Caps at MAX_EXTRA so the suggestion stays
    // realistic; falls back to "all remaining days at max" if even that isn't
    // enough.
    const RECOVERY_TARGET_DAYS = 14
    const MAX_EXTRA = 200
    const STEP = 25
    let recovery:
      | { kind: 'tighten' | 'loosen'; extraPerDay: number; daysNeeded: number; achievable: boolean }
      | null = null

    if (recommendation !== 'on-track' && daysLeft > 0) {
      const magnitude = Math.abs(gap)
      const ideal = magnitude / RECOVERY_TARGET_DAYS
      // Round up to nearest STEP, clamp to [50, MAX_EXTRA]
      let extraPerDay = Math.min(MAX_EXTRA, Math.max(50, Math.ceil(ideal / STEP) * STEP))
      let daysNeeded = Math.ceil(magnitude / extraPerDay)
      let achievable = daysNeeded <= daysLeft
      if (!achievable && recommendation !== 'loosen') {
        extraPerDay = MAX_EXTRA
        daysNeeded = daysLeft
      }
      recovery = {
        kind: recommendation === 'loosen' ? 'loosen' : 'tighten',
        extraPerDay,
        daysNeeded,
        achievable,
      }
    }

    return {
      cumulativePoints,
      hasData: true as const,
      actualCum,
      expectedCum,
      gap,
      gapPerDay,
      avgPerDayActual,
      remainingTotal,
      daysLeft,
      recommendation,
      recovery,
    }
  }, [computed, elapsedDays, totalDays, todayISO])

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-4">
      {/* Title */}
      <div>
        <h2 className="m-0 mb-0.5 font-display text-[16px] font-bold tracking-[-0.02em] text-text">
          Tavoiteanalyysi
          {activePeriod && (
            <span className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
              {activePeriod.type}
            </span>
          )}
        </h2>
        <p className="m-0 text-[12px] text-white/35">
          {(activePeriod?.startDate ?? settings.startDate).slice(5).replace('-', '/')} – {(activePeriod?.endDate ?? settings.endDate).slice(5).replace('-', '/')} · {(activePeriod?.startWeight ?? settings.startWeight)} → {(activePeriod?.targetWeight ?? settings.targetWeight)} kg
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="mb-1.5 flex justify-between text-[11px] text-white/35">
          <span>Päivä {elapsedDays} / {totalDays}</span>
          <span>{progressPct.toFixed(0)} %</span>
        </div>
        <div className="h-1 overflow-hidden rounded-sm bg-white/[0.06]">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-accent to-[#e8d07a] transition-[width] duration-[600ms] ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Chart */}
      <Card variant="glass" className="-mt-1 p-4">
        <GoalChart
          startDate={activePeriod?.startDate ?? settings.startDate}
          endDate={activePeriod?.endDate ?? settings.endDate}
          startWeight={activePeriod?.startWeight ?? settings.startWeight}
          targetWeight={activePeriod?.targetWeight ?? settings.targetWeight}
          trendData={trend.trendData}
          periods={periods}
        />
      </Card>

      {/* Not enough data state */}
      {notEnoughData && (
        <Card variant="glass" className="px-4 py-5 text-center">
          <p className="m-0 mb-1.5 text-[14px] text-white/50">
            Ei tarpeeksi dataa analyysiin
          </p>
          <p className="m-0 text-[12px] leading-normal text-white/[0.28]">
            Kirjaa paino vähintään 4 päivänä ennen kuin tavoiteanalyysi aktivoituu.
            ({trend.trendData.length}/4 kirjausta)
          </p>
        </Card>
      )}

      {/* Per-type trend status — slope-based interpretation that's aware of
          cut vs maintenance vs refill (envelope + plateau) vs bulk. */}
      {trendStatus && trendStatus.status !== 'no-data' && (
        <TrendStatusBanner result={trendStatus} period={activePeriod} />
      )}

      {/* Analysis cards */}
      {analysis && (
        <>
          {/* Recommendation banner — driven by position gap (kg above/below the target line) */}
          <InfoCardWrapper
            info={{
              title: 'Suositus (painon perusteella)',
              body: (
                <>
                  <p className="m-0 mb-2">
                    Tämä laatikko vertaa nykyistä trendipainoa siihen, missä sinun
                    pitäisi olla tavoitelinjalla tänään.
                  </p>
                  <p className="m-0 mb-2">
                    <strong className="text-text">Toleranssit:</strong>
                  </p>
                  <ul className="m-0 mb-2 pl-[18px]">
                    <li>±0,3 kg → Oikealla radalla (vihreä)</li>
                    <li>0,3–1,0 kg yli → Hieman jäljessä (keltainen)</li>
                    <li>&gt;1,0 kg yli → Selkeästi jäljessä (punainen)</li>
                    <li>&lt;−0,3 kg (alle linjan) → Edellä tavoitetta</li>
                  </ul>
                  <p className="m-0 text-white/45">
                    Tekstissä mainittu kcal/pv-luku = mitä päivätason vajetta loppuajalle
                    tarvittaisiin, jotta tavoite saavutetaan suunniteltuna päivänä.
                  </p>
                </>
              ),
            }}
          >
            <WeightRecommendationBanner
              rec={analysis.recommendation}
              positionGapKg={analysis.positionGap}
              requiredDailyDeficit={analysis.requiredDailyDeficit}
            />
          </InfoCardWrapper>

          {/* Position-based key numbers */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="Tavoitepaino tänään"
              value={`${analysis.expectedWeightToday.toFixed(1)} kg`}
              sub="lineaarinen tavoitelinja"
              accent={false}
              info={{
                title: 'Tavoitepaino tänään',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Mikä paino sinulla pitäisi olla tänään, jos pudotus tapahtuisi
                      tasaisesti koko cut-jakson ajan.
                    </p>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Laskenta:</strong> aloituspaino −
                      (kokonaispudotus × kulunut osuus jaksosta).
                    </p>
                    <p className="m-0 text-white/45">
                      Tämä on sama lineaarinen viiva, joka näkyy yllä olevassa kuvaajassa
                      katkoviivana.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Nykyinen trendi"
              value={`${analysis.currentTrend.toFixed(1)} kg`}
              sub={
                analysis.actualWeeklyKg !== null
                  ? `${analysis.actualWeeklyKg > 0 ? '+' : ''}${analysis.actualWeeklyKg.toFixed(2)} kg/vk`
                  : '—'
              }
              accent={false}
              info={{
                title: 'Nykyinen trendi',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Trendipaino:</strong> 7 päivän
                      liukuva keskiarvo painokirjauksistasi. Tasoittaa vesipainon ja
                      päivittäisen vaihtelun, joten heijastaa todellista kehitystä
                      paremmin kuin yksittäinen mittaus.
                    </p>
                    <p className="m-0">
                      <strong className="text-text">Viikkotahti (kg/vk):</strong>{' '}
                      trendikäyrän kulmakerroin viimeisten 14 päivän aikaikkunassa,
                      kerrottuna seitsemällä. Aikapohjainen — toimii vaikka kirjauksia
                      jäisi väliin.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Ero tavoitelinjasta"
              value={
                Math.abs(analysis.positionGap) < 0.05
                  ? '≈ 0 kg'
                  : `${analysis.positionGap > 0 ? '+' : ''}${analysis.positionGap.toFixed(2)} kg`
              }
              sub={
                analysis.positionGap > 0.05
                  ? 'yli linjan'
                  : analysis.positionGap < -0.05
                    ? 'alle linjan'
                    : 'linjalla'
              }
              accent={Math.abs(analysis.positionGap) > POS_THRESHOLD_OK}
              info={{
                title: 'Ero tavoitelinjasta',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Laskenta:</strong> nykyinen
                      trendipaino − tavoitepaino tänään.
                    </p>
                    <p className="m-0 mb-2">
                      Positiivinen luku tarkoittaa että paino on{' '}
                      <strong className="text-danger">yli linjan</strong> (jäljessä
                      aikataulusta). Negatiivinen luku ={' '}
                      <strong style={{ color: '#34d399' }}>alle linjan</strong> (edellä).
                    </p>
                    <p className="m-0 text-white/45">
                      Toleranssit: ±0,3 kg = oikealla radalla · 0,3–1,0 kg = hieman
                      jäljessä · &gt;1,0 kg = selkeästi jäljessä. Tämä määrää myös
                      suosituslaatikon värin.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Jäljellä"
              value={`${analysis.remainingKg.toFixed(2)} kg`}
              sub={`${analysis.remainingDays} pv jäljellä`}
              accent={false}
              info={{
                title: 'Jäljellä',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Kuinka monta kiloa nykyisestä trendipainosta on enää pudotettava
                      tavoitepainoon, sekä jäljellä olevat päivät tavoitepäivään.
                    </p>
                    <p className="m-0">
                      <strong className="text-text">Laskenta:</strong> max(0,
                      nykyinen trendi − tavoitepaino). Päivät = jakson päättymispäivä −
                      tänään.
                    </p>
                  </>
                ),
              }}
            />
          </div>

          {/* Projected date */}
          <InfoCardWrapper
            info={{
              title: 'Arvioitu tavoitepäivä',
              body: (
                <>
                  <p className="m-0 mb-2">
                    Milloin saavutat tavoitepainosi, jos jatkat nykyisellä
                    viikkotahdilla.
                  </p>
                  <p className="m-0 mb-2">
                    <strong className="text-text">Laskenta:</strong> jäljellä
                    olevat kilot ÷ nykyinen viikkotahti × 7 päivää, lisättynä
                    tämänpäivän päiväykseen.
                  </p>
                  <p className="m-0 text-white/45">
                    Vaatii selvän laskevan trendin (&gt; 0,01 kg/vk pudotusta).
                    Tasaisella tai nousevalla trendillä päivää ei voi projisoida.
                  </p>
                </>
              ),
            }}
          >
            <ProjectedDateCard
              projectedDate={analysis.projectedDate}
              targetDate={settings.endDate}
              targetWeight={settings.targetWeight}
              currentTrend={analysis.currentTrend}
            />
          </InfoCardWrapper>
        </>
      )}

      {/* ── Cumulative deficit section ──────────────────────────── */}
      <div className="mt-3 border-t border-white/[0.06] pt-5">
        <h2 className="m-0 mb-0.5 font-display text-[16px] font-bold tracking-[-0.02em] text-text">Kalorivajeanalyysi</h2>
        <p className="m-0 text-[12px] text-white/35">
          Kumulatiivinen vaje · tavoite {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal
        </p>
      </div>

      <Card variant="glass" className="-mt-2 p-4">
        <DeficitChart
          startDate={settings.startDate}
          endDate={settings.endDate}
          totalDeficitTarget={computed.totalDeficitTarget}
          cumulativePoints={deficit.cumulativePoints}
        />
      </Card>

      {!deficit.hasData && (
        <Card variant="glass" className="px-4 py-5 text-center">
          <p className="m-0 mb-1.5 text-[14px] text-white/50">
            Ei kirjattua kulutusta vielä
          </p>
          <p className="m-0 text-[12px] leading-normal text-white/[0.28]">
            Lisää aterioita Tänään-välilehdeltä — vaje kerääntyy päivien edetessä.
          </p>
        </Card>
      )}

      {deficit.hasData && (
        <>
          <InfoCardWrapper
            info={{
              title: 'Suositus (vajeen perusteella)',
              body: (
                <>
                  <p className="m-0 mb-2">
                    Tämä laatikko vertaa toteutunutta kumulatiivista vajetta
                    siihen, missä pitäisi olla tasaisella tahdilla.
                  </p>
                  <p className="m-0 mb-2">
                    <strong className="text-text">Toleranssit (per päivä):</strong>
                  </p>
                  <ul className="m-0 mb-2 pl-[18px]">
                    <li>±100 kcal/pv → Oikealla radalla</li>
                    <li>100–300 kcal/pv jäljessä → Hieman jäljessä</li>
                    <li>&gt;300 kcal/pv jäljessä → Selkeästi jäljessä</li>
                    <li>&gt;100 kcal/pv edellä → Voit löystää</li>
                  </ul>
                  <p className="m-0 text-white/45">
                    Päivätason ero = kokonaisero ÷ kuluneet päivät.
                  </p>
                </>
              ),
            }}
          >
            <RecommendationBanner rec={deficit.recommendation} gap={deficit.gapPerDay} />
          </InfoCardWrapper>

          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="Vaadittu vaje"
              value={`${Math.round(deficit.expectedCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(computed.dailyDeficitBase)} kcal/pv`}
              accent={false}
              info={{
                title: 'Vaadittu vaje',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Mikä kumulatiivinen kalorivaje sinulla pitäisi olla nyt, jos
                      olisit edennyt tavoitteen mukaisella tahdilla jakson alusta.
                    </p>
                    <p className="m-0">
                      <strong className="text-text">Laskenta:</strong> päivittäinen
                      perusvaje × kuluneet päivät. Päivittäinen perusvaje =
                      (kokonaispudotus × 7 700 kcal) ÷ jakson kokonaispituus.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Toteutunut vaje"
              value={`${Math.round(deficit.actualCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(deficit.avgPerDayActual)} kcal/pv keskim.`}
              accent={false}
              info={{
                title: 'Toteutunut vaje',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Yhteenlaskettu päivävaje niiltä päiviltä joilta löytyy kirjattu
                      ateria tai treenikulutus.
                    </p>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Päivän vaje:</strong> TDEE +
                      ekstratreeni + treenikulutus − kulutetut kalorit.
                    </p>
                    <p className="m-0 text-white/45">
                      Päivät joilta ei ole yhtään kirjausta jätetään pois — emme
                      arvaa niiden vajetta.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Ero"
              value={
                Math.abs(deficit.gap) < 50
                  ? '≈ 0 kcal'
                  : `${deficit.gap > 0 ? '+' : ''}${Math.round(deficit.gap).toLocaleString('fi-FI')} kcal`
              }
              sub={
                deficit.gap > 0
                  ? `${Math.round(deficit.gapPerDay)} kcal/pv jäljessä`
                  : deficit.gap < 0
                    ? `${Math.round(Math.abs(deficit.gapPerDay))} kcal/pv edellä`
                    : 'täsmälleen'
              }
              accent={Math.abs(deficit.gapPerDay) > THRESHOLD_CLOSE}
              info={{
                title: 'Ero',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Laskenta:</strong> vaadittu vaje
                      − toteutunut vaje.
                    </p>
                    <p className="m-0 mb-2">
                      Positiivinen = jäljessä (vajetta jäänyt kerryttämättä).
                      Negatiivinen = edellä.
                    </p>
                    <p className="m-0 text-white/45">
                      Alarivi: ero ÷ kuluneet päivät. Kertoo paljonko vajetta pitäisi
                      lisätä joka päivä saadakseen kiinni. Toleranssi ±100 kcal/pv.
                    </p>
                  </>
                ),
              }}
            />
            <StatCard
              label="Jäljellä"
              value={`${Math.max(0, Math.round(deficit.remainingTotal)).toLocaleString('fi-FI')} kcal`}
              sub={`${deficit.daysLeft} pv jäljellä`}
              accent={false}
              info={{
                title: 'Jäljellä',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Kuinka paljon kumulatiivista vajetta on vielä kerättävä, jotta
                      saavutat kokonaistavoitteen.
                    </p>
                    <p className="m-0">
                      <strong className="text-text">Laskenta:</strong>{' '}
                      kokonaistavoitevaje (= kokonaispudotus × 7 700 kcal) − toteutunut
                      vaje tähän asti.
                    </p>
                  </>
                ),
              }}
            />
          </div>

          {deficit.recovery && (
            <InfoCardWrapper
              info={{
                title: 'Suositus tasoitukseen',
                body: (
                  <>
                    <p className="m-0 mb-2">
                      Tämä laatikko ehdottaa konkreettista määrää lisävajetta ja
                      päivien lukumäärän, joka palauttaa tasaiselle tavoitelinjalle.
                    </p>
                    <p className="m-0 mb-2">
                      <strong className="text-text">Laskenta:</strong> kokonaisero ÷
                      14 (oletustavoiteaika kuromiseen), pyöristettynä lähimpään 25
                      kcal:iin, rajoitettuna välille 50–200 kcal/pv. Tarvittavat päivät =
                      kokonaisero ÷ valittu kcal/pv.
                    </p>
                    <p className="m-0 text-white/45">
                      Jos edes 200 kcal/pv koko jäljellä olevalle ajalle ei riitä, laatikko
                      muuttuu punaiseksi ja ehdottaa tavoitepäivän pidennystä tai
                      tavoitepainon nostoa.
                    </p>
                  </>
                ),
              }}
            >
              <SuggestionCard
                recovery={deficit.recovery}
                dailyDeficitBase={Math.round(computed.dailyDeficitBase)}
              />
            </InfoCardWrapper>
          )}
        </>
      )}

      {/* How it works */}
      <details className="mt-1">
        <summary className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-white/25 [list-style:none]">
          ▸ Miten lasketaan?
        </summary>
        <div className="mt-2.5 px-0.5 text-[11px] leading-[1.7] text-white/[0.38]">
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Tavoitelinja:</strong> lineaarinen viiva cut-jakson alusta loppuun (aloituspaino → tavoitepaino).
          </p>
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Trendilinja:</strong> 7 pv liukuva keskiarvo kirjatuista painoista — tasoittaa vesipainon vaihtelut.
          </p>
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Tavoitepaino tänään:</strong> aloituspaino − (kokonais­pudotus × kulunut osuus jaksosta).
          </p>
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Ero tavoitelinjasta:</strong> nykyinen trendipaino − tavoitepaino tänään. Positiivinen = yli linjan (jäljessä), negatiivinen = alle linjan (edellä).
          </p>
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Viikkotahti:</strong> trendi­käyrän kulmakerroin 14 päivän aikaikkunassa kerrottuna 7:llä — kg/viikossa.
          </p>
          <p className="m-0 mb-1.5">
            <strong className="text-white/50">Kumulatiivinen vaje:</strong> päivittäisten toteutuneiden vajeiden summa. Päivän vaje = TDEE + treenibonus − (kulutus − treeniaikana poltetut kcal). Vain päivät joilta on kirjauksia lasketaan mukaan.
          </p>
          <p className="m-0">
            <strong className="text-white/50">Toleranssit:</strong> paino ±0,3 kg linjasta = oikealla radalla · 0,3–1,0 kg = hienoinen ero · &gt;1,0 kg = merkittävä ero · kalorivaje ±100 kcal/pv = oikealla radalla.
          </p>
        </div>
      </details>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

interface BannerStyle { emoji: string; title: string; bg: string; border: string }
const BANNER_STYLE: Record<Recommendation, BannerStyle> = {
  'on-track': {
    emoji: '✅',
    title: 'Oikealla radalla',
    bg: 'rgba(100,200,120,0.06)',
    border: 'rgba(100,200,120,0.2)',
  },
  'tighten-slightly': {
    emoji: '⚠️',
    title: 'Hieman jäljessä',
    bg: 'rgba(232,184,90,0.06)',
    border: 'rgba(232,184,90,0.2)',
  },
  'tighten-significantly': {
    emoji: '🔴',
    title: 'Selkeästi jäljessä',
    bg: 'rgba(248,113,113,0.06)',
    border: 'rgba(248,113,113,0.2)',
  },
  'loosen': {
    emoji: '💚',
    title: 'Edellä tavoitetta',
    bg: 'rgba(100,200,120,0.06)',
    border: 'rgba(100,200,120,0.2)',
  },
}

function BannerShell({ rec, body }: { rec: Recommendation; body: string }) {
  const c = BANNER_STYLE[rec]
  return (
    <div
      className="flex items-start gap-3 rounded-card border px-4 py-3.5"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <span className="mt-px flex-shrink-0 text-[18px]">{c.emoji}</span>
      <div>
        <p className="m-0 mb-1 text-[13px] font-bold text-text">{c.title}</p>
        <p className="m-0 text-[12px] leading-normal text-white/55">{body}</p>
      </div>
    </div>
  )
}

// Trend status banner — driven by lib/trendStatus.ts, per-period-type
// interpretation. Lives alongside the position-based banner; both are
// shown so the user gets "where you are" AND "how you're moving".
function TrendStatusBanner({
  result,
  period,
}: {
  result: import('../lib/trendStatus').TrendStatusResult
  period: import('../types').GoalPeriod | null
}) {
  const palette: Record<typeof result.tone, { bg: string; border: string; emoji: string }> = {
    ok: { bg: 'rgba(100,200,120,0.06)', border: 'rgba(100,200,120,0.2)', emoji: '✅' },
    info: { bg: 'rgba(106,154,212,0.06)', border: 'rgba(106,154,212,0.2)', emoji: '💡' },
    warn: { bg: 'rgba(232,184,90,0.06)', border: 'rgba(232,184,90,0.2)', emoji: '⚠️' },
    danger: { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)', emoji: '🔴' },
  }
  const c = palette[result.tone]
  return (
    <div
      className="flex items-start gap-3 rounded-card border px-4 py-3.5"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <span className="mt-px flex-shrink-0 text-[18px]">{c.emoji}</span>
      <div>
        <p className="m-0 mb-1 text-[13px] font-bold text-text">
          {result.title}
          {period && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/40">
              {period.type}
            </span>
          )}
        </p>
        <p className="m-0 text-[12px] leading-normal text-white/55">
          {result.body}
        </p>
      </div>
    </div>
  )
}

// Weight banner: copy describes position vs target line.
function WeightRecommendationBanner({
  rec,
  positionGapKg,
  requiredDailyDeficit,
}: {
  rec: Recommendation
  positionGapKg: number
  requiredDailyDeficit: number
}) {
  const abs = Math.abs(positionGapKg).toFixed(1)
  const rateHint = `Vajetta tarvitaan noin ${Math.round(requiredDailyDeficit)} kcal/pv loppuajan.`
  const body =
    rec === 'on-track'
      ? `Trendipainosi seuraa tavoitelinjaa. ${rateHint}`
      : rec === 'tighten-slightly'
        ? `Painosi on ${abs} kg yli tavoitelinjan. ${rateHint}`
        : rec === 'tighten-significantly'
          ? `Painosi on ${abs} kg yli tavoitelinjan. Nykyisellä tahdilla tavoite ei toteudu — ${rateHint.toLowerCase()}`
          : `Painosi on ${abs} kg alle tavoitelinjan. Voit hieman löystää.`
  return <BannerShell rec={rec} body={body} />
}

// Deficit banner: copy describes kcal/day gap.
function RecommendationBanner({ rec, gap }: { rec: Recommendation; gap: number }) {
  const abs = Math.round(Math.abs(gap))
  const body =
    rec === 'on-track'
      ? 'Nykyinen tahti vastaa tavoitetta. Jatka samaan malliin.'
      : rec === 'tighten-slightly'
        ? `Vajetta tarvitaan noin ${abs} kcal/pv enemmän. Pienennä annoksia tai lisää liikettä.`
        : rec === 'tighten-significantly'
          ? `Nykyisellä tahdilla tavoitepäivä ei tule toteutumaan. Tarvitaan noin ${abs} kcal/pv lisää vajetta.`
          : `Menetät painoa nopeammin kuin tarvitaan (${abs} kcal/pv edellä). Voit hieman löystää.`
  return <BannerShell rec={rec} body={body} />
}

function StatCard({
  label,
  value,
  sub,
  accent,
  info,
}: {
  label: string
  value: string
  sub: string
  accent: boolean
  info?: { title: string; body: React.ReactNode }
}) {
  const [showInfo, setShowInfo] = useState(false)
  const clickable = !!info
  return (
    <>
      <div
        onClick={clickable ? () => setShowInfo(true) : undefined}
        role={clickable ? 'button' : undefined}
        className={`relative min-h-0 min-w-0 rounded-glass border bg-white/[0.04] px-3.5 py-3.5 [backdrop-filter:blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] ${
          accent ? 'border-border-hi' : 'border-white/[0.06]'
        } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {clickable && (
          <span
            aria-hidden="true"
            className="absolute right-2.5 top-2 font-mono text-[11px] font-semibold leading-none text-white/[0.22]"
          >
            ⓘ
          </span>
        )}
        <p className="m-0 mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white/35">
          {label}
        </p>
        <p
          className={`m-0 mb-[3px] text-[17px] font-bold tabular-nums tracking-[-0.01em] ${
            accent ? 'text-accent' : 'text-text'
          }`}
        >
          {value}
        </p>
        {sub && (
          <p className="m-0 text-[11px] text-white/30">{sub}</p>
        )}
      </div>
      {showInfo && info && (
        <InfoModal title={info.title} body={info.body} onClose={() => setShowInfo(false)} />
      )}
    </>
  )
}

function InfoModal({
  title,
  body,
  onClose,
}: {
  title: string
  body: React.ReactNode
  onClose: () => void
}) {
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="text-[13px] leading-relaxed text-white/75">
        {body}
      </div>
      <Button variant="primary" onClick={onClose} className="mt-[18px] flex-none">
        Sulje
      </Button>
    </Sheet>
  )
}

// Wraps any card so tapping it opens an InfoModal explaining how the number(s)
// inside are computed. Used for the recommendation banners, the projected-date
// card, and the recovery suggestion card — anywhere we want to expose the
// underlying formula without cluttering the card itself.
function InfoCardWrapper({
  info,
  children,
}: {
  info: { title: string; body: React.ReactNode }
  children: React.ReactNode
}) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <>
      <div
        onClick={() => setShowInfo(true)}
        role="button"
        className="relative cursor-pointer"
      >
        <span
          aria-hidden="true"
          className="absolute right-3 top-2 z-[1] font-mono text-[11px] font-semibold leading-none text-white/[0.28]"
        >
          ⓘ
        </span>
        {children}
      </div>
      {showInfo && (
        <InfoModal title={info.title} body={info.body} onClose={() => setShowInfo(false)} />
      )}
    </>
  )
}

function ProjectedDateCard({
  projectedDate,
  targetDate,
  targetWeight,
  currentTrend,
}: {
  projectedDate: string | null
  targetDate: string
  targetWeight: number
  currentTrend: number
}) {
  if (currentTrend <= targetWeight) {
    return (
      <div
        className="rounded-card border px-4 py-3.5"
        style={{ backgroundColor: 'rgba(100,200,120,0.06)', borderColor: 'rgba(100,200,120,0.15)' }}
      >
        <p className="m-0 text-[13px] text-white/70">
          🎯 Tavoitepaino saavutettu!
        </p>
      </div>
    )
  }

  if (!projectedDate) {
    return (
      <div className="rounded-card bg-white/[0.03] px-4 py-3.5">
        <p className="m-0 text-[12px] leading-normal text-white/35">
          Projisoidun päättymispäivän laskemiseen tarvitaan selvä laskeva trendi.
        </p>
      </div>
    )
  }

  const onTime = projectedDate <= targetDate
  const daysDiff = Math.abs(daysBetween(projectedDate, targetDate))

  return (
    <div
      className="rounded-card border px-4 py-3.5"
      style={{
        backgroundColor: onTime ? 'rgba(100,200,120,0.05)' : 'rgba(248,113,113,0.05)',
        borderColor: onTime ? 'rgba(100,200,120,0.15)' : 'rgba(248,113,113,0.15)',
      }}
    >
      <p className="m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-white/30">
        Arvioitu tavoitepäivä nykyisellä tahdilla
      </p>
      <p className="m-0 mb-1 text-[17px] font-bold text-text">
        {formatDateFi(projectedDate)}
      </p>
      <p className="m-0 text-[12px]" style={{ color: onTime ? 'rgba(100,200,120,0.8)' : 'rgba(248,113,113,0.8)' }}>
        {onTime
          ? `${daysDiff} pv ennen tavoitetta`
          : `${daysDiff} pv tavoitepäivän jälkeen`}
      </p>
    </div>
  )
}

function formatDateFi(iso: string): string {
  return fromISO(iso).toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}

function SuggestionCard({
  recovery,
  dailyDeficitBase,
}: {
  recovery: { kind: 'tighten' | 'loosen'; extraPerDay: number; daysNeeded: number; achievable: boolean }
  dailyDeficitBase: number
}) {
  const isTighten = recovery.kind === 'tighten'
  const newDailyTarget = isTighten
    ? dailyDeficitBase + recovery.extraPerDay
    : Math.max(0, dailyDeficitBase - recovery.extraPerDay)

  const accent = recovery.achievable ? '#22d3ee' : '#f87171'
  const bg = recovery.achievable ? 'rgba(34,211,238,0.06)' : 'rgba(248,113,113,0.06)'
  const border = recovery.achievable ? 'rgba(34,211,238,0.2)' : 'rgba(248,113,113,0.25)'

  return (
    <div
      className="rounded-card border px-4 py-3.5"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <p
        className="m-0 mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: accent }}
      >
        Suositus
      </p>

      {recovery.achievable ? (
        <>
          <p className="m-0 mb-2 text-[13px] leading-[1.55] text-white/85">
            {isTighten ? 'Lisää ' : 'Vähennä '}
            <strong className="text-text">
              {recovery.extraPerDay} kcal/pv
            </strong>
            {' '}vajetta{' '}
            <strong className="text-text">{recovery.daysNeeded} päivän</strong>{' '}
            ajaksi → palaat tavoitelinjalle.
          </p>
          <p className="m-0 text-[11px] leading-normal text-white/45">
            Päiväbudjetti tällä jaksolla noin{' '}
            <span className="tabular-nums text-white/70">
              {newDailyTarget.toLocaleString('fi-FI')} kcal/pv
            </span>{' '}
            vaje (oletus {dailyDeficitBase.toLocaleString('fi-FI')}).
          </p>
        </>
      ) : (
        <>
          <p className="m-0 mb-2 text-[13px] leading-[1.55] text-white/85">
            Vaje on liian suuri saavuttaaksesi tavoitteen jäljellä olevassa ajassa.
            Maksimi 200 kcal/pv lisävaje koko jäljellä olevalle{' '}
            <strong className="text-text">{recovery.daysNeeded} päivälle</strong> ei riitä.
          </p>
          <p className="m-0 text-[11px] leading-normal text-white/45">
            Harkitse tavoitepäivän siirtoa eteenpäin tai tavoitepainon nostamista hieman.
          </p>
        </>
      )}
    </div>
  )
}
