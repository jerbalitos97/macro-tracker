import { useMemo } from 'react'
import type { ComputedResult, Settings, WeightEntry } from '../types'
import { computeWeightTrend } from '../lib/weight'
import { daysBetween, toISO, addDays, fromISO } from '../lib/dates'
import { GoalChart } from '../components/GoalChart'
import { DeficitChart } from '../components/DeficitChart'

// ── Recommendation thresholds ────────────────────────────────
// gap = requiredDailyDeficit − actualDailyDeficit  (kcal/day)
//   positive gap  → behind pace (need more deficit)
//   negative gap  → ahead of pace (could loosen)
const THRESHOLD_CLOSE = 100     // ±100 kcal/day → on track
const THRESHOLD_MODERATE = 300  // 100–300 → slightly off
//                               > 300 → significantly off

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

    if (currentTrend === null || weeklyChange === null || trendData.length < 4) return null

    const remainingKg = Math.max(0, currentTrend - settings.targetWeight)
    const remainingDays = daysBetween(todayISO, settings.endDate)

    if (remainingDays <= 0) return null

    // Required pace from today to target date
    const requiredTotalDeficit = remainingKg * 7700           // kcal
    const requiredDailyDeficit = requiredTotalDeficit / remainingDays  // kcal/day
    const requiredWeeklyKg = (requiredDailyDeficit * 7) / 7700         // kg/week

    // Actual pace from weight trend
    const actualDailyDeficit = (-weeklyChange * 7700) / 7     // kcal/day (positive = losing)
    const actualWeeklyKg = weeklyChange                        // kg/week (negative = losing)

    // Gap: positive means we're behind (need more deficit)
    const gap = requiredDailyDeficit - actualDailyDeficit

    // Projected goal date at current pace
    let projectedDate: string | null = null
    if (weeklyChange < -0.01) {
      const weeksNeeded = remainingKg / Math.abs(weeklyChange)
      projectedDate = addDays(todayISO, Math.round(weeksNeeded * 7))
    } else if (weeklyChange >= -0.01 && weeklyChange <= 0.01) {
      projectedDate = null // no meaningful pace
    }

    // Recommendation
    let recommendation: Recommendation
    if (Math.abs(gap) <= THRESHOLD_CLOSE) {
      recommendation = 'on-track'
    } else if (gap < -THRESHOLD_CLOSE) {
      recommendation = 'loosen'
    } else if (gap <= THRESHOLD_MODERATE) {
      recommendation = 'tighten-slightly'
    } else {
      recommendation = 'tighten-significantly'
    }

    return {
      remainingKg,
      remainingDays,
      requiredDailyDeficit,
      requiredWeeklyKg,
      actualDailyDeficit,
      actualWeeklyKg,
      gap,
      projectedDate,
      recommendation,
      currentTrend,
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
          {/* Recommendation banner */}
          <RecommendationBanner rec={analysis.recommendation} gap={analysis.gap} />

          {/* Key numbers grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard
              label="Vaadittu tahti"
              value={`${Math.round(analysis.requiredDailyDeficit)} kcal/pv`}
              sub={`${analysis.requiredWeeklyKg.toFixed(2)} kg/vk`}
              accent={false}
            />
            <StatCard
              label="Nykyinen tahti"
              value={
                analysis.actualDailyDeficit > 0
                  ? `${Math.round(analysis.actualDailyDeficit)} kcal/pv`
                  : '—'
              }
              sub={
                analysis.actualWeeklyKg !== null
                  ? `${analysis.actualWeeklyKg.toFixed(2)} kg/vk`
                  : ''
              }
              accent={false}
            />
            <StatCard
              label="Ero"
              value={
                Math.abs(analysis.gap) < 10
                  ? '≈ 0 kcal/pv'
                  : `${analysis.gap > 0 ? '+' : ''}${Math.round(analysis.gap)} kcal/pv`
              }
              sub={analysis.gap > 0 ? 'jälässä' : analysis.gap < 0 ? 'edellä' : 'täsmälleen'}
              accent={Math.abs(analysis.gap) > THRESHOLD_CLOSE}
            />
            <StatCard
              label="Jäljellä"
              value={`${analysis.remainingKg.toFixed(2)} kg`}
              sub={`${analysis.remainingDays} pv jäljellä`}
              accent={false}
            />
          </div>

          {/* Projected date */}
          <ProjectedDateCard
            projectedDate={analysis.projectedDate}
            targetDate={settings.endDate}
            targetWeight={settings.targetWeight}
            currentTrend={analysis.currentTrend}
          />
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
          <RecommendationBanner rec={deficit.recommendation} gap={deficit.gapPerDay} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard
              label="Vaadittu vaje"
              value={`${Math.round(deficit.expectedCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(computed.dailyDeficitBase)} kcal/pv`}
              accent={false}
            />
            <StatCard
              label="Toteutunut vaje"
              value={`${Math.round(deficit.actualCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(deficit.avgPerDayActual)} kcal/pv keskim.`}
              accent={false}
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
            />
            <StatCard
              label="Jäljellä"
              value={`${Math.max(0, Math.round(deficit.remainingTotal)).toLocaleString('fi-FI')} kcal`}
              sub={`${deficit.daysLeft} pv jäljellä`}
              accent={false}
            />
          </div>

          {deficit.recovery && (
            <SuggestionCard
              recovery={deficit.recovery}
              dailyDeficitBase={Math.round(computed.dailyDeficitBase)}
            />
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
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Vaadittu tahti:</strong> (jäljellä oleva kg × 7 700 kcal) ÷ jäljellä olevat päivät.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Nykyinen tahti:</strong> trendin viikkomuutos × 7 700 ÷ 7 → päiväkohtainen energiavaje-arvio.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Kumulatiivinen vaje:</strong> päivittäisten toteutuneiden vajeiden summa. Päivän vaje = TDEE + treenibonus − (kulutus − treeniaikana poltetut kcal). Vain päivät joilta on kirjauksia lasketaan mukaan.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Toleranssit:</strong> ±100 kcal/pv = oikealla radalla · 100–300 = hienoinen ero · &gt;300 = merkittävä ero.
          </p>
        </div>
      </details>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function RecommendationBanner({ rec, gap }: { rec: Recommendation; gap: number }) {
  const config: Record<Recommendation, { emoji: string; title: string; body: string; bg: string; border: string }> = {
    'on-track': {
      emoji: '✅',
      title: 'Oikealla radalla',
      body: 'Nykyinen tahti vastaa tavoitetta. Jatka samaan malliin.',
      bg: 'rgba(100,200,120,0.06)',
      border: 'rgba(100,200,120,0.2)',
    },
    'tighten-slightly': {
      emoji: '⚠️',
      title: 'Hieman jäljessä',
      body: `Vajetta tarvitaan noin ${Math.round(Math.abs(gap))} kcal/pv enemmän. Pienennä annoksia tai lisää liikettä.`,
      bg: 'rgba(232,184,90,0.06)',
      border: 'rgba(232,184,90,0.2)',
    },
    'tighten-significantly': {
      emoji: '🔴',
      title: 'Selkeästi jäljessä',
      body: `Nykyisellä tahdilla tavoitepäivä ei tule toteutumaan. Tarvitaan noin ${Math.round(Math.abs(gap))} kcal/pv lisää vajetta.`,
      bg: 'rgba(232,122,106,0.06)',
      border: 'rgba(232,122,106,0.2)',
    },
    'loosen': {
      emoji: '💚',
      title: 'Edellä tavoitetta',
      body: `Menetät painoa nopeammin kuin tarvitaan (${Math.round(Math.abs(gap))} kcal/pv edellä). Voit hieman löystää.`,
      bg: 'rgba(100,200,120,0.06)',
      border: 'rgba(100,200,120,0.2)',
    },
  }

  const c = config[rec]

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
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{c.body}</p>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent: boolean
}) {
  return (
    <div
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        padding: '14px 14px',
        border: accent ? '1px solid rgba(212,184,90,0.2)' : '1px solid transparent',
      }}
    >
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
