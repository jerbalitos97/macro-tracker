import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ComputedResult, Settings, WeightEntry, Meal, TdeeEvalResult } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { computeWeightTrend, estimateTdeeAdjustment } from '../lib/weight'
import { buildAnalysis } from '../lib/analysis'
import { analyzeBloat } from '../lib/bloat'
import { getPeriods } from '../lib/goalPeriods'
import { GoalChart } from '../components/GoalChart'
import { DeficitChart } from '../components/DeficitChart'
import { RolloutModal } from '../components/RolloutModal'
import { Card, Button } from '../components/ui'

// The single analysis screen. "Trendit" and "Tavoite" were two tabs asking the
// same question with different arithmetic, and Paino carried a third slice of
// it; every screen that computed something about progress could disagree with
// its neighbours. Analysis lives here now, and only here — Paino records
// weigh-ins, the calendar records days, and this reads all of it.

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

/** Signed number with a real minus sign, and no "−0.0" for values that round
 *  to zero. Mixing "−370" and "-9" inside one card reads as two different
 *  kinds of number. */
function signed(n: number, digits = 1): string {
  const v = Math.abs(n) < 0.5 / 10 ** digits ? 0 : n
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
}
function signedInt(n: number): string {
  const v = Math.round(n)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fi-FI')}`
}

const TONE: Record<string, { bg: string; border: string; emoji: string }> = {
  ok: { bg: 'rgba(100,200,120,0.06)', border: 'rgba(100,200,120,0.2)', emoji: '✅' },
  info: { bg: 'rgba(106,154,212,0.07)', border: 'rgba(106,154,212,0.22)', emoji: '💡' },
  warn: { bg: 'rgba(232,184,90,0.06)', border: 'rgba(232,184,90,0.2)', emoji: '⚠️' },
  danger: { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)', emoji: '🔴' },
}

interface Props {
  computed: ComputedResult
  settings: Settings
  weights: WeightEntry[]
  meals: Meal[]
  /** Rolls a signed kcal total forward onto future days, tagged with its source. */
  onApplyRollout: (days: Array<{ date: string; kcal: number }>, sourceKey: string) => void
}

export function AnalysisView({ computed, settings, weights, meals, onApplyRollout }: Props) {
  const todayISO = toISO(new Date())
  const [showRollout, setShowRollout] = useState(false)

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const a = useMemo(
    () => buildAnalysis({ settings, computed, trend, today: todayISO }),
    [settings, computed, trend, todayISO],
  )
  const bloat = useMemo(() => analyzeBloat(weights, trend), [weights, trend])
  const tdee = useMemo(() => estimateTdeeAdjustment(weights, meals, settings), [weights, meals, settings])
  const periods = useMemo(() => getPeriods(settings), [settings])

  const goal = a.goal
  const progressPct = goal.totalDays > 0 ? (goal.elapsedDays / goal.totalDays) * 100 : 0
  const tone = TONE[a.headline.tone]

  return (
    <div className="px-4 pb-8 pt-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-3">
        <h2 className="m-0 font-display text-[22px] font-bold tracking-[-0.025em] text-text">
          Analyysi
          <span className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
            {goal.type}
          </span>
        </h2>
        <p className="m-0 mt-[3px] text-[11px] uppercase tracking-[0.1em] text-muted">
          {formatDateShort(goal.startDate)} – {formatDateShort(goal.endDate)} · {goal.startWeight.toFixed(1)} → {goal.targetWeight.toFixed(1)} kg
        </p>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex justify-between text-[11px] text-fg-faint">
          <span>Päivä {goal.elapsedDays} / {goal.totalDays}</span>
          <span>{progressPct.toFixed(0)} %</span>
        </div>
        <div className="h-1 overflow-hidden rounded-sm bg-[rgba(9,11,20,0.50)]">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-accent to-[#e8d07a] transition-[width] duration-[600ms] ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── One verdict ────────────────────────────────────────────
          Position and rate get a line each inside the same card. They
          routinely point different ways — banked progress with a flattening
          slope is the normal mid-cut state — and as two separate banners that
          read as the app contradicting itself. */}
      <div
        className="rounded-card border px-4 py-4"
        style={{ backgroundColor: tone.bg, borderColor: tone.border }}
      >
        <div className="flex items-start gap-3">
          <span className="mt-px flex-shrink-0 text-[18px]">{tone.emoji}</span>
          <p className="m-0 text-[14px] font-bold text-text">{a.headline.title}</p>
        </div>
        {a.headline.lines.length > 0 && (
          <dl className="m-0 mt-3 flex flex-col gap-2 border-t border-white/[0.08] pt-3">
            {a.headline.lines.map((line) => (
              <div key={line.label} className="flex gap-2.5">
                <dt
                  className={`w-[52px] flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] ${
                    line.label === 'Toimi' ? 'text-accent' : 'text-fg-ghost'
                  }`}
                >
                  {line.label}
                </dt>
                <dd className="m-0 text-[12px] leading-normal text-fg-muted">{line.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <Explain summary="Miksi sijainti ja vauhti voivat kertoa eri asiaa">
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Sijainti</strong> vertaa trendipainoasi siihen, missä
          tavoitelinja kulkee tänään. Se on koko jakson kertymä — nopea alku näkyy siinä vielä
          viikkoja myöhemmin.
        </p>
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Vauhti</strong> on trendikäyrän kulmakerroin viimeisen
          14 päivän ajalta. Se kertoo vain siitä, mitä juuri nyt tapahtuu.
        </p>
        <p className="m-0">
          Molemmat voivat siis olla oikeassa yhtä aikaa: voit olla reilusti edellä aikataulua ja
          samalla hidastunut alle tavoitetahdin. Siksi ne ovat saman kortin kaksi riviä eivätkä
          kaksi erillistä tuomiota.
        </p>
      </Explain>

      {/* ── Weight ─────────────────────────────────────────────── */}
      <SectionTitle>Paino</SectionTitle>

      <Card variant="glass" className="p-4">
        <GoalChart
          startDate={goal.startDate}
          endDate={goal.endDate}
          startWeight={goal.startWeight}
          targetWeight={goal.targetWeight}
          trendData={trend.trendData}
          periods={periods}
        />
      </Card>

      {a.hasWeightData ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Stat label="Tavoitepaino tänään" value={`${a.expectedWeightToday.toFixed(1)} kg`} sub="lineaarinen tavoitelinja" />
          <Stat label="Nykyinen trendi" value={`${(a.currentTrend ?? 0).toFixed(1)} kg`} sub={a.weeklyChange !== null ? `${signed(a.weeklyChange, 2)} kg/vko` : undefined} />
          <Stat
            label="Ero tavoitelinjasta"
            value={`${signed(a.positionGapKg)} kg`}
            sub={a.positionGapKg > 0 ? 'yli linjan' : 'alle linjan'}
            accent={a.positionGapKg <= 0.3}
          />
          <Stat
            label="Jäljellä"
            value={`${a.remainingKg.toFixed(1)} kg`}
            sub={`${a.daysLeft} pv jäljellä`}
          />
          <div className="col-span-2">
            <Stat
              label="Arvioitu tavoitepäivä"
              value={a.projectedDate ? formatDateShort(a.projectedDate) : '—'}
              sub={
                a.projectedDate
                  ? a.projectedDate <= goal.endDate
                    ? `✓ ennen jakson loppua ${formatDateShort(goal.endDate)}`
                    : `× jakson loppu ${formatDateShort(goal.endDate)} ohittuu nykyvauhdilla`
                  : 'vaatii selvän laskevan trendin'
              }
              accent={!!a.projectedDate && a.projectedDate <= goal.endDate}
            />
          </div>
        </div>
      ) : (
        <Card variant="glass" className="mt-2.5 px-4 py-5 text-center">
          <p className="m-0 text-[13px] text-fg-muted">Ei tarpeeksi painodataa</p>
          <p className="m-0 mt-1 text-[12px] text-fg-ghost">
            Kirjaa paino vähintään 4 päivänä. ({trend.trendData.length}/4)
          </p>
        </Card>
      )}

      {/* ── Weekly rhythm / water weight ───────────────────────── */}
      <SectionTitle>Viikkorytmi ja turvotus</SectionTitle>
      <BloatCard bloat={bloat} headlineRate={a.weeklyChange} />

      {/* ── Cumulative deficit ─────────────────────────────────── */}
      <SectionTitle>Kalorivaje</SectionTitle>

      <Card variant="glass" className="p-4">
        <DeficitChart
          startDate={goal.startDate}
          endDate={goal.endDate}
          totalDeficitTarget={computed.totalDeficitTarget}
          cumulativePoints={a.cumulativePoints}
        />
      </Card>

      {a.hasDeficitData ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Stat
              label="Vaadittu tähän asti"
              value={`${Math.round(a.expectedCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(a.plannedPerDayDone)} kcal/pv näinä päivinä`}
            />
            <Stat
              label="Toteutunut"
              value={`${Math.round(a.actualCum).toLocaleString('fi-FI')} kcal`}
              sub={`${Math.round(a.avgPerDayActual)} kcal/pv keskim.`}
            />
            <Stat
              label="Ero"
              value={`${signedInt(a.gapKcal)} kcal`}
              sub={`${signedInt(a.gapPerDay)} kcal/pv · ${a.gapKcal > 0 ? 'jäljessä' : 'edellä'}`}
              accent={Math.abs(a.gapPerDay) <= 100}
            />
            <Stat
              label="Jäljellä tavoitteeseen"
              value={`${Math.max(0, Math.round(a.remainingTotal)).toLocaleString('fi-FI')} kcal`}
              sub={`tavoite ${Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal`}
            />
          </div>

          {a.recovery && (
            <Card
              variant="glass"
              className={`mt-2.5 ${a.recovery.achievable ? '' : 'border-danger/25'}`}
            >
              <div className={cardLabel}>Suositus tasoitukseen</div>
              <p className="m-0 text-[13px] leading-relaxed text-text">
                {a.recovery.kind === 'tighten' ? 'Tiukenna' : 'Löysää'}{' '}
                <strong className="text-accent">{a.recovery.extraPerDay} kcal/pv</strong>{' '}
                seuraavat <strong className="text-accent">{a.recovery.daysNeeded} päivää</strong>,
                {a.recovery.achievable
                  ? ` niin ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal:n ero on umpeen kurottu.`
                  : ` mikä kattaa ${Math.abs(a.recovery.totalKcal).toLocaleString('fi-FI')} kcal koko ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal:n erosta.`}
              </p>
              {!a.recovery.achievable && (
                <p className="m-0 mt-1.5 text-[12px] leading-normal text-danger">
                  Ero on niin suuri, ettei se kurou umpeen edes {a.recovery.extraPerDay} kcal/pv koko
                  jäljellä olevalla ajalla. Harkitse jakson pidentämistä tai tavoitepainon tarkistusta.
                </p>
              )}
              <Button
                variant="primary"
                className="mt-3 w-full"
                onClick={() => setShowRollout(true)}
              >
                Jalkauta suositus
              </Button>
              <p className="m-0 mt-1.5 text-center text-[10px] text-fg-ghost">
                voit säätää osuutta ja jakson pituutta ennen tallennusta
              </p>
            </Card>
          )}
        </>
      ) : (
        <Card variant="glass" className="mt-2.5 px-4 py-5 text-center">
          <p className="m-0 text-[13px] text-fg-muted">Ei vielä kirjattuja päiviä</p>
          <p className="m-0 mt-1 text-[12px] text-fg-ghost">
            Kirjaa aterioita, niin kumulatiivinen vaje alkaa kertyä tähän.
          </p>
        </Card>
      )}

      {/* ── TDEE check ─────────────────────────────────────────── */}
      <SectionTitle>Kulutusarvion tarkistus</SectionTitle>
      <TdeeCard tdee={tdee} />

      <Explain summary="Miten kaikki lasketaan">
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Tavoitelinja:</strong> suora viiva jakson alusta loppuun,
          aloituspainosta tavoitepainoon.
        </p>
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Trendi:</strong> 7 päivän liukuva keskiarvo kirjatuista
          aamupainoista.
        </p>
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Viikkotahti:</strong> trendin muutos viimeisen 14 päivän
          yli, muunnettuna kiloiksi viikossa.
        </p>
        <p className="m-0 mb-1.5">
          <strong className="text-fg-muted">Päivän vaje:</strong> TDEE + treenibonus − (syödyt kcal −
          treenissä poltetut). Vain päivät joilta on kirjauksia lasketaan.
        </p>
        <p className="m-0">
          <strong className="text-fg-muted">Toleranssit:</strong> paino ±0,3 kg linjasta · vauhti
          ±0,2 kg/vko tavoitteesta · vaje ±100 kcal/pv.
        </p>
      </Explain>

      {showRollout && a.recovery && (
        <RolloutModal
          title="Jalkauta tasoitus"
          description={
            a.recovery.kind === 'tighten'
              ? `Kumulatiivinen vaje on ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal jäljessä suunnitelmasta. Tämä jakaa suositellun ${Math.abs(a.recovery.totalKcal).toLocaleString('fi-FI')} kcal:n tasoituksen tuleville päiville päivittäisinä säätöinä.`
              : `Olet ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal edellä suunnitelmaa. Tämä jakaa suositellun ${Math.abs(a.recovery.totalKcal).toLocaleString('fi-FI')} kcal:n löysäyksen tuleville päiville.`
          }
          totalKcal={a.recovery.kind === 'tighten' ? -Math.abs(a.recovery.totalKcal) : Math.abs(a.recovery.totalKcal)}
          suggestedDays={a.recovery.daysNeeded}
          fromDate={todayISO}
          lastDate={goal.endDate}
          onApply={(days) => {
            onApplyRollout(days, `tasoitus-${todayISO}`)
            setShowRollout(false)
          }}
          onClose={() => setShowRollout(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 mt-6 border-t border-white/[0.06] pt-5 font-display text-[15px] font-bold tracking-[-0.02em] text-text">
      {children}
    </h3>
  )
}

function Explain({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-2">
      <summary className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-fg-ghost [list-style:none]">
        ▸ {summary}
      </summary>
      <div className="mt-2 px-0.5 text-[11px] leading-[1.7] text-fg-faint">{children}</div>
    </details>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-panel border border-white/10 bg-[rgba(9,11,20,0.45)] px-3.5 py-3">
      <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-fg-ghost">{label}</div>
      <div className={`mt-1 font-display text-[19px] font-bold tabular-nums tracking-[-0.02em] ${accent ? 'text-accent' : 'text-text'}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] leading-tight text-fg-faint">{sub}</div>}
    </div>
  )
}

function BloatCard({
  bloat,
  headlineRate,
}: {
  bloat: ReturnType<typeof analyzeBloat>
  headlineRate: number | null
}) {
  if (!bloat.ready) {
    return (
      <Card variant="glass" className="px-4 py-4">
        <p className="m-0 text-[12px] leading-relaxed text-fg-muted">{bloat.message}</p>
      </Card>
    )
  }

  const max = Math.max(...bloat.byDow.map((d) => Math.abs(d.meanDeviation)), 0.1)

  return (
    <Card variant="glass" className="px-4 py-4">
      <div className={cardLabel}>Poikkeama omasta trendistä</div>

      <div className="flex items-end justify-between gap-1">
        {bloat.byDow.map((d) => {
          const h = (Math.abs(d.meanDeviation) / max) * 34
          const up = d.meanDeviation >= 0
          return (
            <div key={d.dow} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[38px] w-full flex-col justify-end">
                {up && (
                  <div
                    className="w-full rounded-t-[3px] bg-danger/55"
                    style={{ height: `${h}px` }}
                  />
                )}
              </div>
              <div className="h-px w-full bg-white/15" />
              <div className="flex h-[38px] w-full flex-col justify-start">
                {!up && (
                  <div
                    className="w-full rounded-b-[3px] bg-accent/55"
                    style={{ height: `${h}px` }}
                  />
                )}
              </div>
              <div className="font-mono text-[9px] uppercase text-fg-ghost">{d.label}</div>
              <div className="font-mono text-[9px] tabular-nums text-fg-faint">
                {signed(d.meanDeviation)}
              </div>
            </div>
          )
        })}
      </div>

      <p className="m-0 mt-3.5 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-fg-muted">
        Viikon heilunta on <strong className="text-text">{bloat.swingKg.toFixed(1)} kg</strong>:
        raskain päivä on <strong className="text-text">{bloat.peak?.label}</strong>{' '}
        ({signed(bloat.peak?.meanDeviation ?? 0)} kg trendin yli)
        ja kevyin <strong className="text-text">{bloat.trough?.label}</strong>{' '}
        ({signed(bloat.trough?.meanDeviation ?? 0)} kg).
        {bloat.recoveryDays !== null && (
          <> Piikki laskee puoleen keskimäärin <strong className="text-text">{bloat.recoveryDays.toFixed(1)} päivässä</strong>.</>
        )}
      </p>

      {bloat.weekdayOnlyWeeklyChange !== null && headlineRate !== null && (
        <p className="m-0 mt-2 text-[11px] leading-relaxed text-fg-faint">
          Ristiintarkistus: pelkistä arkipäivistä laskettuna vauhti on{' '}
          <span className="tabular-nums text-fg-muted">
            {signed(bloat.weekdayOnlyWeeklyChange, 2)} kg/vko
          </span>{' '}
          — otsikkoluku on{' '}
          <span className="tabular-nums text-fg-muted">
            {signed(headlineRate, 2)} kg/vko
          </span>
          . Mitä lähempänä nämä ovat, sitä varmemmin turvotus ei ohjaa lukua.
        </p>
      )}

      <Explain summary="Pitäisikö viikonloput jättää pois keskiarvosta?">
        <p className="m-0 mb-1.5">
          Ei. 7 päivän liukuva keskiarvo sisältää aina täsmälleen yhden lauantain ja yhden
          sunnuntain, joten sama turvotus on mukana jokaisessa trendin pisteessä yhtä suurena — ja
          kumoutuu, kun kahta pistettä verrataan keskenään. Juuri sitä viikkotahti tekee.
        </p>
        <p className="m-0 mb-1.5">
          Jos viikonloput poistettaisiin, keskiarvo rakentuisi vain viikon kevyimmistä päivistä ja
          asettuisi noin {Math.max(0.1, bloat.swingKg * 0.28).toFixed(1)} kg todellista alemmas.
          Yksikin läpi päässyt viikonloppulukema hyppäyttäisi tasoa ilman että mikään on muuttunut.
        </p>
        <p className="m-0">
          Kirjaa siis joka aamu ja jätä kaikki lukemat keskiarvoon. Yksittäinen korkea sunnuntai ei
          ole takaisku — se on tässä kortissa mitattu ja odotettu.
        </p>
      </Explain>
    </Card>
  )
}

function TdeeCard({ tdee }: { tdee: TdeeEvalResult | null }) {
  if (!tdee) {
    return (
      <Card variant="glass" className="px-4 py-4">
        <p className="m-0 text-[12px] text-fg-muted">
          Kulutusarvion tarkistus tarvitsee painotrendin — kirjaa painoa muutamana päivänä lisää.
        </p>
      </Card>
    )
  }
  if (!tdee.ready) {
    return (
      <Card variant="glass" className="px-4 py-4">
        <p className="m-0 text-[12px] leading-relaxed text-fg-muted">{tdee.message}</p>
      </Card>
    )
  }

  const off = Math.round(Math.abs(tdee.tdeeError))
  const steps = [
    {
      k: 'Paino kertoo',
      v: `Trendi on liikkunut ${signed(tdee.weeklyChange!, 2)} kg/vko viimeisen 14 päivän aikana.`,
    },
    {
      k: 'Se vastaa',
      v: `noin ${Math.round(tdee.trendImpliedDailyDeficit)} kcal/pv vajetta (1 kg ≈ 7 700 kcal).`,
    },
    {
      k: 'Söit',
      v: `keskimäärin ${Math.round(tdee.avgConsumed).toLocaleString('fi-FI')} kcal/pv.`,
    },
    {
      k: 'Eli kulutat',
      v: `noin ${Math.round(tdee.realTdeeEstimate).toLocaleString('fi-FI')} kcal/pv.`,
    },
    {
      k: 'Sovellus olettaa',
      v: `${Math.round(tdee.avgAssumedTdee).toLocaleString('fi-FI')} kcal/pv päivätyyppiesi perusteella.`,
    },
  ]

  return (
    <Card variant="glass" className={`px-4 py-4 ${tdee.significantError ? 'border-accent/20' : ''}`}>
      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <div key={s.k} className="flex gap-2.5">
            <span className="w-[86px] flex-shrink-0 font-mono text-[9px] uppercase leading-[1.5] tracking-[0.06em] text-fg-ghost">
              {s.k}
            </span>
            <span className="text-[12px] leading-[1.5] text-fg-muted">{s.v}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-white/[0.08] pt-3">
        {tdee.significantError ? (
          <p className="m-0 text-[13px] leading-relaxed text-accent">
            Oletus on <strong>{off} kcal/pv {tdee.direction === 'lower' ? 'liian korkea' : 'liian matala'}</strong>.
            {' '}{tdee.direction === 'lower' ? 'Laske' : 'Nosta'} Asetusten TDEE-lukuja noin {off} kcal
            kaikissa päivätyypeissä, niin päiväbudjetit osuvat kohdalleen.
          </p>
        ) : (
          <p className="m-0 text-[13px] leading-relaxed text-accent">
            ✓ Oletus ja toteuma ovat {off} kcal/pv päässä toisistaan — alle 100 kcal, eli
            TDEE-asetuksia ei kannata koskea.
          </p>
        )}
      </div>
    </Card>
  )
}
