import { useMemo, useState } from 'react'
import type { ComputedResult, Settings, WeightEntry } from '../types'
import { computeWeightTrend } from '../lib/weight'
import { daysBetween, toISO, addDays, fromISO } from '../lib/dates'
import { GoalChart } from '../components/GoalChart'
import { DeficitChart } from '../components/DeficitChart'
import { s } from '../styles/tokens'

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
    <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Title */}
      <div>
        <h2 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Tavoiteanalyysi</h2>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {settings.startDate.slice(5).replace('-', '/')} – {settings.endDate.slice(5).replace('-', '/')} · {settings.startWeight} → {settings.targetWeight} kg
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          <span>Päivä {elapsedDays} / {totalDays}</span>
          <span>{progressPct.toFixed(0)} %</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: 2,
              background: 'linear-gradient(90deg, #d4b85a, #e8d07a)',
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: -4 }}>
        <GoalChart
          startDate={settings.startDate}
          endDate={settings.endDate}
          startWeight={settings.startWeight}
          targetWeight={settings.targetWeight}
          trendData={trend.trendData}
        />
      </div>

      {/* Not enough data state */}
      {notEnoughData && (
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '20px 16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            Ei tarpeeksi dataa analyysiin
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.5 }}>
            Kirjaa paino vähintään 4 päivänä ennen kuin tavoiteanalyysi aktivoituu.
            ({trend.trendData.length}/4 kirjausta)
          </p>
        </div>
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
                  <p style={{ margin: '0 0 8px' }}>
                    Tämä laatikko vertaa nykyistä trendipainoa siihen, missä sinun
                    pitäisi olla tavoitelinjalla tänään.
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong style={{ color: '#fff' }}>Toleranssit:</strong>
                  </p>
                  <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                    <li>±0,3 kg → Oikealla radalla (vihreä)</li>
                    <li>0,3–1,0 kg yli → Hieman jäljessä (keltainen)</li>
                    <li>&gt;1,0 kg yli → Selkeästi jäljessä (punainen)</li>
                    <li>&lt;−0,3 kg (alle linjan) → Edellä tavoitetta</li>
                  </ul>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard
              label="Tavoitepaino tänään"
              value={`${analysis.expectedWeightToday.toFixed(1)} kg`}
              sub="lineaarinen tavoitelinja"
              accent={false}
              info={{
                title: 'Tavoitepaino tänään',
                body: (
                  <>
                    <p style={{ margin: '0 0 8px' }}>
                      Mikä paino sinulla pitäisi olla tänään, jos pudotus tapahtuisi
                      tasaisesti koko cut-jakson ajan.
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> aloituspaino −
                      (kokonaispudotus × kulunut osuus jaksosta).
                    </p>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Trendipaino:</strong> 7 päivän
                      liukuva keskiarvo painokirjauksistasi. Tasoittaa vesipainon ja
                      päivittäisen vaihtelun, joten heijastaa todellista kehitystä
                      paremmin kuin yksittäinen mittaus.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: '#fff' }}>Viikkotahti (kg/vk):</strong>{' '}
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
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> nykyinen
                      trendipaino − tavoitepaino tänään.
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      Positiivinen luku tarkoittaa että paino on{' '}
                      <strong style={{ color: '#e87a6a' }}>yli linjan</strong> (jäljessä
                      aikataulusta). Negatiivinen luku ={' '}
                      <strong style={{ color: '#8acb88' }}>alle linjan</strong> (edellä).
                    </p>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
                    <p style={{ margin: '0 0 8px' }}>
                      Kuinka monta kiloa nykyisestä trendipainosta on enää pudotettava
                      tavoitepainoon, sekä jäljellä olevat päivät tavoitepäivään.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> max(0,
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
                  <p style={{ margin: '0 0 8px' }}>
                    Milloin saavutat tavoitepainosi, jos jatkat nykyisellä
                    viikkotahdilla.
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong style={{ color: '#fff' }}>Laskenta:</strong> jäljellä
                    olevat kilot ÷ nykyinen viikkotahti × 7 päivää, lisättynä
                    tämänpäivän päiväykseen.
                  </p>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
      <div style={{ marginTop: 12, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#fff' }}>Kalorivajeanalyysi</h2>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          Kumulatiivinen vaje · tavoite {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal
        </p>
      </div>

      <div style={{ marginTop: -8 }}>
        <DeficitChart
          startDate={settings.startDate}
          endDate={settings.endDate}
          totalDeficitTarget={computed.totalDeficitTarget}
          cumulativePoints={deficit.cumulativePoints}
        />
      </div>

      {!deficit.hasData && (
        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '20px 16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            Ei kirjattua kulutusta vielä
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.5 }}>
            Lisää aterioita Tänään-välilehdeltä — vaje kerääntyy päivien edetessä.
          </p>
        </div>
      )}

      {deficit.hasData && (
        <>
          <InfoCardWrapper
            info={{
              title: 'Suositus (vajeen perusteella)',
              body: (
                <>
                  <p style={{ margin: '0 0 8px' }}>
                    Tämä laatikko vertaa toteutunutta kumulatiivista vajetta
                    siihen, missä pitäisi olla tasaisella tahdilla.
                  </p>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong style={{ color: '#fff' }}>Toleranssit (per päivä):</strong>
                  </p>
                  <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                    <li>±100 kcal/pv → Oikealla radalla</li>
                    <li>100–300 kcal/pv jäljessä → Hieman jäljessä</li>
                    <li>&gt;300 kcal/pv jäljessä → Selkeästi jäljessä</li>
                    <li>&gt;100 kcal/pv edellä → Voit löystää</li>
                  </ul>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
                    Päivätason ero = kokonaisero ÷ kuluneet päivät.
                  </p>
                </>
              ),
            }}
          >
            <RecommendationBanner rec={deficit.recommendation} gap={deficit.gapPerDay} />
          </InfoCardWrapper>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard
              label="Vaadittu vaje"
              value={`${Math.round(deficit.expectedCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(computed.dailyDeficitBase)} kcal/pv`}
              accent={false}
              info={{
                title: 'Vaadittu vaje',
                body: (
                  <>
                    <p style={{ margin: '0 0 8px' }}>
                      Mikä kumulatiivinen kalorivaje sinulla pitäisi olla nyt, jos
                      olisit edennyt tavoitteen mukaisella tahdilla jakson alusta.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> päivittäinen
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
                    <p style={{ margin: '0 0 8px' }}>
                      Yhteenlaskettu päivävaje niiltä päiviltä joilta löytyy kirjattu
                      ateria tai treenikulutus.
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Päivän vaje:</strong> TDEE +
                      ekstratreeni + treenikulutus − kulutetut kalorit.
                    </p>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> vaadittu vaje
                      − toteutunut vaje.
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      Positiivinen = jäljessä (vajetta jäänyt kerryttämättä).
                      Negatiivinen = edellä.
                    </p>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
                    <p style={{ margin: '0 0 8px' }}>
                      Kuinka paljon kumulatiivista vajetta on vielä kerättävä, jotta
                      saavutat kokonaistavoitteen.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong>{' '}
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
                    <p style={{ margin: '0 0 8px' }}>
                      Tämä laatikko ehdottaa konkreettista määrää lisävajetta ja
                      päivien lukumäärän, joka palauttaa tasaiselle tavoitelinjalle.
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      <strong style={{ color: '#fff' }}>Laskenta:</strong> kokonaisero ÷
                      14 (oletustavoiteaika kuromiseen), pyöristettynä lähimpään 25
                      kcal:iin, rajoitettuna välille 50–200 kcal/pv. Tarvittavat päivät =
                      kokonaisero ÷ valittu kcal/pv.
                    </p>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>
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
      <details style={{ marginTop: 4 }}>
        <summary
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.25)',
            cursor: 'pointer',
            userSelect: 'none',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ▸ Miten lasketaan?
        </summary>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'rgba(255,255,255,0.38)',
            lineHeight: 1.7,
            padding: '0 2px',
          }}
        >
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Tavoitelinja:</strong> lineaarinen viiva cut-jakson alusta loppuun (aloituspaino → tavoitepaino).
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Trendilinja:</strong> 7 pv liukuva keskiarvo kirjatuista painoista — tasoittaa vesipainon vaihtelut.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Tavoitepaino tänään:</strong> aloituspaino − (kokonais­pudotus × kulunut osuus jaksosta).
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Ero tavoitelinjasta:</strong> nykyinen trendipaino − tavoitepaino tänään. Positiivinen = yli linjan (jäljessä), negatiivinen = alle linjan (edellä).
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Viikkotahti:</strong> trendi­käyrän kulmakerroin 14 päivän aikaikkunassa kerrottuna 7:llä — kg/viikossa.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Kumulatiivinen vaje:</strong> päivittäisten toteutuneiden vajeiden summa. Päivän vaje = TDEE + treenibonus − (kulutus − treeniaikana poltetut kcal). Vain päivät joilta on kirjauksia lasketaan mukaan.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Toleranssit:</strong> paino ±0,3 kg linjasta = oikealla radalla · 0,3–1,0 kg = hienoinen ero · &gt;1,0 kg = merkittävä ero · kalorivaje ±100 kcal/pv = oikealla radalla.
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
    bg: 'rgba(232,122,106,0.06)',
    border: 'rgba(232,122,106,0.2)',
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
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{c.emoji}</span>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.title}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{body}</p>
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
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: '14px 14px',
          border: accent ? '1px solid rgba(212,184,90,0.2)' : '1px solid transparent',
          cursor: clickable ? 'pointer' : 'default',
          position: 'relative',
          minHeight: 'auto',
          minWidth: 'auto',
        }}
      >
        {clickable && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 8,
              right: 10,
              fontSize: 11,
              color: 'rgba(255,255,255,0.22)',
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            ⓘ
          </span>
        )}
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.35)',
            fontFamily: "ui-monospace, 'SF Mono', monospace",
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: '0 0 3px',
            fontSize: 17,
            fontWeight: 700,
            color: accent ? '#d4b85a' : '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
          }}
        >
          {value}
        </p>
        {sub && (
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{sub}</p>
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
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} className="modal-enter" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.15)',
            margin: '-4px auto 14px',
          }}
        />
        <div style={s.modalTitle}>{title}</div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.6,
          }}
        >
          {body}
        </div>
        <button onClick={onClose} style={{ ...s.primaryBtn, marginTop: 18, flex: 'unset' }}>
          Sulje
        </button>
      </div>
    </div>
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
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
            fontSize: 11,
            color: 'rgba(255,255,255,0.28)',
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontWeight: 600,
            zIndex: 1,
            lineHeight: 1,
          }}
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
      <div style={{ backgroundColor: 'rgba(100,200,120,0.06)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(100,200,120,0.15)' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          🎯 Tavoitepaino saavutettu!
        </p>
      </div>
    )
  }

  if (!projectedDate) {
    return (
      <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '14px 16px' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
          Projisoidun päättymispäivän laskemiseen tarvitaan selvä laskeva trendi.
        </p>
      </div>
    )
  }

  const onTime = projectedDate <= targetDate
  const daysDiff = Math.abs(daysBetween(projectedDate, targetDate))

  return (
    <div
      style={{
        backgroundColor: onTime ? 'rgba(100,200,120,0.05)' : 'rgba(232,122,106,0.05)',
        borderRadius: 12,
        padding: '14px 16px',
        border: `1px solid ${onTime ? 'rgba(100,200,120,0.15)' : 'rgba(232,122,106,0.15)'}`,
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        Arvioitu tavoitepäivä nykyisellä tahdilla
      </p>
      <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: '#fff' }}>
        {formatDateFi(projectedDate)}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: onTime ? 'rgba(100,200,120,0.8)' : 'rgba(232,122,106,0.8)' }}>
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

  const accent = recovery.achievable ? '#d4b85a' : '#e87a6a'
  const bg = recovery.achievable ? 'rgba(212,184,90,0.06)' : 'rgba(232,122,106,0.06)'
  const border = recovery.achievable ? 'rgba(212,184,90,0.2)' : 'rgba(232,122,106,0.25)'

  return (
    <div
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: accent,
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontWeight: 700,
        }}
      >
        Suositus
      </p>

      {recovery.achievable ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
            {isTighten ? 'Lisää ' : 'Vähennä '}
            <strong style={{ color: '#fff' }}>
              {recovery.extraPerDay} kcal/pv
            </strong>
            {' '}vajetta{' '}
            <strong style={{ color: '#fff' }}>{recovery.daysNeeded} päivän</strong>{' '}
            ajaksi → palaat tavoitelinjalle.
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Päiväbudjetti tällä jaksolla noin{' '}
            <span style={{ color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
              {newDailyTarget.toLocaleString('fi-FI')} kcal/pv
            </span>{' '}
            vaje (oletus {dailyDeficitBase.toLocaleString('fi-FI')}).
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
            Vaje on liian suuri saavuttaaksesi tavoitteen jäljellä olevassa ajassa.
            Maksimi 200 kcal/pv lisävaje koko jäljellä olevalle{' '}
            <strong style={{ color: '#fff' }}>{recovery.daysNeeded} päivälle</strong> ei riitä.
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Harkitse tavoitepäivän siirtoa eteenpäin tai tavoitepainon nostamista hieman.
          </p>
        </>
      )}
    </div>
  )
}
