import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ComputedResult, Settings, WeightEntry, Meal, TdeeEvalResult, DailyAdjustment } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { computeWeightTrend, estimateTdeeAdjustment } from '../lib/weight'
import { buildAnalysis } from '../lib/analysis'
import { analyzeBloat } from '../lib/bloat'
import { getPeriods, getActivePeriod, getPeriodForDate } from '../lib/goalPeriods'
import { getBlocks, pullBlocks, blockForDate } from '../lib/blocks'
import type { TrainingBlock } from '../lib/blocks'
import { INTENTS, intentOf, plannedWeeklyLossKg } from '../lib/planning'
import { useAuth } from '../contexts/AuthContext'
import { GoalChart } from '../components/GoalChart'
import { DeficitChart } from '../components/DeficitChart'
import { RolloutModal } from '../components/RolloutModal'
import { MaintenanceGuardCard } from '../components/MaintenanceGuardCard'
import { Card, Button } from '../components/ui'

// The single analysis screen. "Trendit" and "Tavoite" were two tabs asking the
// same question with different arithmetic, and Paino carried a third slice of
// it; every screen that computed something about progress could disagree with
// its neighbours. Analysis lives here now, and only here — Paino records
// weigh-ins, the calendar records days, and this reads all of it.

const cardLabel = 'mb-2.5 text-[12px] font-medium   text-muted'

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

// The verdict is this screen's expressive hero: the design's violet→blue
// gradient when things are on track, the same shape tinted amber or red when
// the verdict asks for action — the tone still reads before the words do.
const TONE: Record<string, { bg: string; border: string }> = {
  ok: { bg: 'linear-gradient(135deg, rgba(167,139,250,0.36), rgba(59,130,246,0.20))', border: 'rgba(167,139,250,0.40)' },
  info: { bg: 'linear-gradient(135deg, rgba(167,139,250,0.36), rgba(59,130,246,0.20))', border: 'rgba(167,139,250,0.40)' },
  warn: { bg: 'linear-gradient(135deg, rgba(232,184,90,0.28), rgba(167,139,250,0.18))', border: 'rgba(232,184,90,0.40)' },
  danger: { bg: 'linear-gradient(135deg, rgba(248,113,113,0.28), rgba(167,139,250,0.18))', border: 'rgba(248,113,113,0.40)' },
}

interface Props {
  computed: ComputedResult
  settings: Settings
  weights: WeightEntry[]
  meals: Meal[]
  adjustments: DailyAdjustment[]
  setSettings: (s: Settings) => void
  /** Rolls a signed kcal total forward onto future days, tagged with its source. */
  onApplyRollout: (days: Array<{ date: string; kcal: number }>, sourceKey: string) => void
  onDeleteAdjustment: (id: number) => void
}

export function AnalysisView({
  computed, settings, weights, meals, adjustments, setSettings,
  onApplyRollout, onDeleteAdjustment,
}: Props) {
  const { user } = useAuth()
  const todayISO = toISO(new Date())
  const [showRollout, setShowRollout] = useState(false)
  // Kulutus on oletuksena auki: kun ero tulee jostain, se tulee useimmiten
  // siitä, että oletettu TDEE ei pidä — syöminen kirjataan joka tapauksessa.
  const [lens, setLens] = useState<'eat' | 'burn'>('burn')
  const [blocks, setBlocks] = useState<TrainingBlock[]>(() => getBlocks())

  useEffect(() => {
    if (!user) return
    let alive = true
    pullBlocks(user.id).then((b) => { if (alive) setBlocks(b) })
    return () => { alive = false }
  }, [user])

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const a = useMemo(
    () => buildAnalysis({ settings, computed, trend, today: todayISO }),
    [settings, computed, trend, todayISO],
  )
  const bloat = useMemo(() => analyzeBloat(weights, trend), [weights, trend])
  const tdee = useMemo(() => estimateTdeeAdjustment(weights, meals, settings), [weights, meals, settings])
  const periods = useMemo(() => getPeriods(settings), [settings])

  const goal = a.goal
  const activeBlock = blockForDate(blocks, todayISO)
  // The period covering *today*, not merely the one flagged active — a period
  // planned for a future block is active but says nothing about this week's
  // training. Fall back to the active one when today sits between periods.
  const periodNow = getPeriodForDate(settings, todayISO) ?? getActivePeriod(settings, todayISO)
  const progressPct = goal.totalDays > 0 ? (goal.elapsedDays / goal.totalDays) * 100 : 0
  const tone = TONE[a.headline.tone]

  return (
    <div className="px-4 pb-8 pt-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-3">
        <h2 className="m-0 flex items-center gap-2 text-[22px] font-medium leading-7 text-text">
          Analyysi
          <span className="rounded-md bg-cyan/[0.16] px-2 py-[3px] text-[12px] font-medium leading-4 text-[#a5f3fc]">
            {goal.type}
          </span>
        </h2>
        <p className="m-0 mt-1 text-[14px] leading-5 tabular-nums text-fg-muted">
          {formatDateShort(goal.startDate)} – {formatDateShort(goal.endDate)} · {goal.startWeight.toFixed(1)} → {goal.targetWeight.toFixed(1)} kg
        </p>
      </div>

      {/* Ylläpidon vahti. Ylimpänä, koska se on ainoa kortti tällä ruudulla
          joka pyytää päätöstä — loput raportoivat. */}
      <MaintenanceGuardCard
        settings={settings}
        setSettings={setSettings}
        weights={weights}
        adjustments={adjustments}
        todayISO={todayISO}
        onApplyRollout={onApplyRollout}
        onDeleteAdjustment={onDeleteAdjustment}
      />

      <div className="mb-4 mt-4">
        <div className="mb-1.5 flex justify-between text-[12px] tabular-nums text-fg-muted">
          <span>Päivä {goal.elapsedDays} / {goal.totalDays}</span>
          <span>{progressPct.toFixed(0)} %</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-white/[0.12]">
          <div
            className="h-full rounded bg-gradient-to-r from-cyan to-violet transition-[width] duration-[600ms] ease-out"
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
        className="rounded-[48px_48px_48px_16px] border px-6 py-7"
        style={{ background: tone.bg, borderColor: tone.border }}
      >
        <p className="m-0 text-[32px] font-normal leading-10 text-text">{a.headline.title}</p>
        {a.headline.lines.length > 0 && (
          <dl className="m-0 mt-4 flex flex-col gap-2.5">
            {a.headline.lines.map((line) => (
              <div key={line.label} className="flex gap-3">
                <dt
                  className={`w-[64px] flex-shrink-0 text-[14px] font-medium ${
                    line.label === 'Toimi' ? 'text-accent' : 'text-fg-ghost'
                  }`}
                >
                  {line.label}
                </dt>
                <dd className="m-0 text-[14px] leading-5 text-fg-muted">{line.text}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Tasoitus on osa tuomiota eikä oma korttinsa: tuomio sanoo mitä
            tehdä, ja tämä on se teko. Erillisenä korttina se toisti sijainnin
            ("trendi on X kg linjan yläpuolella") jonka tuomion rivi jo kertoi.
            Ei `hasDeficitData`-ehtoa: ero voidaan lukea painostakin. */}
        {a.recovery && (
          <div className={`mt-4 rounded-2xl bg-[rgba(5,6,12,0.45)] p-4 ${a.recovery.achievable ? '' : 'border border-danger/25'}`}>
          <p className="m-0 text-[14px] leading-relaxed text-text">
            {a.recovery.kind === 'tighten' ? 'Tiukenna' : 'Löysää'}{' '}
            <strong className="text-accent">{a.recovery.extraPerDay} kcal/pv</strong>{' '}
            {a.recovery.weekdaysOnly ? 'jokaiselta jäljellä olevalta' : 'seuraavat'}{' '}
            <strong className="text-accent">
              {a.recovery.daysNeeded} {a.recovery.weekdaysOnly ? 'arkipäivältä' : 'päivää'}
            </strong>,
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
          <p className="m-0 mt-1.5 text-center text-[12px] text-fg-ghost">
            Voit säätää osuutta ja jakson pituutta ennen tallennusta.
          </p>
          </div>
        )}
      </div>

      {activeBlock && (
        <BlockFitCard
          block={activeBlock}
          plannedKg={periodNow ? plannedWeeklyLossKg(periodNow) : 0}
          bodyWeight={a.currentTrend ?? goal.startWeight}
        />
      )}

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
        // Kolme lukua, ei viittä. Sijainti ja vauhti ovat jo tuomion riveillä,
        // ja "tavoitepaino tänään" + "ero" ovat sama tieto kahdesti (ero on
        // trendi miinus linja) — kaaviosta näkee molemmat. Tähän jää se mitä
        // tuomio ei sano: luvut joihin sijainti ja vauhti perustuvat, ja minne
        // ne johtavat.
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Stat label="Trendi" value={`${(a.currentTrend ?? 0).toFixed(1)}`} sub={a.weeklyChange !== null ? `${signed(a.weeklyChange, 2)} kg/vko` : 'kg'} />
          <Stat
            label="Linjasta"
            value={`${signed(a.positionGapKg)}`}
            sub={a.positionGapKg > 0 ? 'kg yli' : 'kg alle'}
            accent={a.positionGapKg <= 0.3}
          />
          <Stat
            label="Tavoitepäivä"
            value={a.projectedDate ? formatDateShort(a.projectedDate) : '—'}
            sub={
              a.projectedDate
                ? `${a.remainingKg.toFixed(1)} kg · ${a.projectedDate <= goal.endDate ? 'ehtii' : 'ei ehdi'}`
                : 'vaatii laskevan trendin'
            }
            accent={!!a.projectedDate && a.projectedDate <= goal.endDate}
          />
        </div>
      ) : (
        <Card variant="glass" className="mt-2.5 px-4 py-5 text-center">
          <p className="m-0 text-[14px] text-fg-muted">Ei tarpeeksi painodataa</p>
          <p className="m-0 mt-1 text-[12px] text-fg-ghost">
            Kirjaa paino vähintään 4 päivänä. ({trend.trendData.length}/4)
          </p>
        </Card>
      )}

      {/* ── Mistä ero tulee ──────────────────────────────────────
          Kalorivaje ja kulutusarvio olivat kaksi raporttia, jotka vastasivat
          samaan kysymykseen kahdesta suunnasta: syönkö suunnitelman mukaan, ja
          kuluttaako keho niin kuin suunnitelma olettaa. Erillään niiden luvut
          näyttivät riitelevän. Yhdessä kortissa ne ovat kaksi riviä samaan
          kysymykseen, ja kaavio vaihtuu riviä napauttamalla. Aiemmin kaikki
          tämä oli "Lisätiedot"-taitoksen takana; karsittuna se mahtuu auki. */}
      <SectionTitle>Mistä ero tulee</SectionTitle>
      <Card variant="glass" className="p-4">
        <div className="flex flex-col gap-0.5 overflow-hidden rounded-2xl">
          {([
            {
              id: 'eat' as const,
              label: 'Syöminen',
              sub: 'kirjattu vaje vs. suunnitelma',
              val: a.hasDeficitData ? `${a.gapPerDay > 0 ? '−' : '+'}${Math.abs(Math.round(a.gapPerDay))} kcal/pv` : '—',
            },
            {
              id: 'burn' as const,
              label: 'Kulutus',
              sub: 'toteutunut vs. oletus',
              val: tdee?.ready ? `${signedInt(Math.round(tdee.realTdeeEstimate - tdee.avgAssumedTdee))} kcal/pv` : '—',
            },
          ]).map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={lens === r.id}
              onClick={() => setLens(r.id)}
              className={`flex min-h-16 items-center gap-3 px-4 py-2.5 text-left ${
                lens === r.id ? 'bg-violet/[0.22] text-white' : 'bg-[var(--surface-2)] text-text'
              }`}
            >
              <span className="flex flex-1 flex-col">
                <span className="text-[16px]">{r.label}</span>
                <span className="text-[12px] text-fg-muted">{r.sub}</span>
              </span>
              <span className="text-[18px] font-medium tabular-nums">{r.val}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {lens === 'eat' ? (
            a.hasDeficitData ? (
              <>
                <DeficitChart
                  startDate={goal.startDate}
                  endDate={goal.endDate}
                  totalDeficitTarget={computed.totalDeficitTarget}
                  cumulativePoints={a.cumulativePoints}
                />
                <p className="m-0 mt-2 text-[14px] leading-5 text-fg-muted">
                  Kertynyt {Math.round(a.actualCum).toLocaleString('fi-FI')} kcal, suunnitelma tähän mennessä{' '}
                  {Math.round(a.expectedCum).toLocaleString('fi-FI')} kcal.
                </p>
              </>
            ) : (
              <p className="m-0 text-[14px] text-fg-muted">
                Ei vielä kirjattuja päiviä. Kirjaa aterioita, niin kumulatiivinen vaje alkaa kertyä tähän.
              </p>
            )
          ) : (
            <TdeeCard tdee={tdee} />
          )}
        </div>
      </Card>

      {/* ── Weekly rhythm / water weight ───────────────────────── */}
      <SectionTitle>Viikkorytmi ja turvotus</SectionTitle>
      <BloatCard bloat={bloat} headlineRate={a.weeklyChange} />

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
              ? a.recovery.source === 'weight'
                ? `Trendipaino on ${Math.abs(a.positionGapKg).toFixed(1)} kg tavoitelinjan yläpuolella, mikä vastaa ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal. Tämä jakaa sen jakson loppuun päivittäisinä säätöinä${a.recovery.weekdaysOnly ? ' — vain arkipäiville, koska viikonloput ovat ylläpidolla' : ''}.`
                : `Kumulatiivinen vaje on ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal jäljessä suunnitelmasta. Tämä jakaa suositellun ${Math.abs(a.recovery.totalKcal).toLocaleString('fi-FI')} kcal:n tasoituksen tuleville päiville päivittäisinä säätöinä${a.recovery.weekdaysOnly ? ' — vain arkipäiville, koska viikonloput ovat ylläpidolla' : ''}.`
              : `Olet ${Math.abs(a.recovery.gapKcal).toLocaleString('fi-FI')} kcal edellä suunnitelmaa. Tämä jakaa suositellun ${Math.abs(a.recovery.totalKcal).toLocaleString('fi-FI')} kcal:n löysäyksen tuleville päiville.`
          }
          totalKcal={a.recovery.kind === 'tighten' ? -Math.abs(a.recovery.totalKcal) : Math.abs(a.recovery.totalKcal)}
          suggestedDays={a.recovery.daysNeeded}
          earliestStart={todayISO}
          lastDate={goal.endDate}
          skipWeekends={a.recovery.weekdaysOnly}
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
      <summary className="flex cursor-pointer select-none items-center gap-1 text-[12px] text-fg-ghost [list-style:none]">
        ▸ {summary}
      </summary>
      <div className="mt-2 px-0.5 text-[12px] leading-[1.7] text-fg-faint">{children}</div>
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
    <div className="rounded-panel border border-white/10 bg-[var(--surface-1)] px-3.5 py-3">
      <div className="text-[12px] font-medium   text-fg-ghost">{label}</div>
      <div className={`mt-1 font-display text-[19px] font-bold tabular-nums tracking-[-0.02em] ${accent ? 'text-accent' : 'text-text'}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] leading-tight text-fg-faint">{sub}</div>}
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
              <div className="font-mono text-[12px]  text-fg-ghost">{d.label}</div>
              <div className="font-mono text-[12px] tabular-nums text-fg-faint">
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
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-fg-faint">
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
            <span className="w-[86px] flex-shrink-0 font-mono text-[12px]  leading-[1.5]  text-fg-ghost">
              {s.k}
            </span>
            <span className="text-[12px] leading-[1.5] text-fg-muted">{s.v}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-white/[0.08] pt-3">
        {tdee.significantError ? (
          <p className="m-0 text-[14px] leading-relaxed text-accent">
            Oletus on <strong>{off} kcal/pv {tdee.direction === 'lower' ? 'liian korkea' : 'liian matala'}</strong>.
            {' '}{tdee.direction === 'lower' ? 'Laske' : 'Nosta'} Asetusten TDEE-lukuja noin {off} kcal
            kaikissa päivätyypeissä, niin päiväbudjetit osuvat kohdalleen.
          </p>
        ) : (
          <p className="m-0 text-[14px] leading-relaxed text-accent">
            ✓ Oletus ja toteuma ovat {off} kcal/pv päässä toisistaan — alle 100 kcal, eli
            TDEE-asetuksia ei kannata koskea.
          </p>
        )}
      </div>
    </Card>
  )
}

/** What the training block currently running asks of the nutrition plan. Not a
 *  verdict of its own — it is one line of context under the verdict, because
 *  the app already learned what happens when three cards each declare how it
 *  is going. Planning and fixing happen in Suunnittelu. */
function BlockFitCard({
  block,
  plannedKg,
  bodyWeight,
}: {
  block: TrainingBlock
  plannedKg: number
  bodyWeight: number
}) {
  const intent = intentOf(block)
  const spec = INTENTS[intent]
  const allowedKg = spec.maxWeeklyLossPct === null ? null : (bodyWeight * spec.maxWeeklyLossPct) / 100
  const over = allowedKg === null ? plannedKg > 0 : plannedKg > allowedKg

  return (
    <div
      className="mt-2.5 rounded-panel border px-3.5 py-3"
      style={{
        borderColor: over ? 'rgba(232,184,90,0.25)' : 'rgba(255,255,255,0.10)',
        backgroundColor: over ? 'rgba(232,184,90,0.05)' : 'var(--surface-1)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 h-7 w-1 flex-shrink-0 rounded-sm"
          style={{ backgroundColor: block.color }}
        />
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-text">
            {block.name || spec.label}
            <span className="ml-2 font-mono text-[12px]   text-fg-ghost">
              {spec.label}
            </span>
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-fg-muted">
            {allowedKg === null ? (
              <>Kilpailupiikki — ravinto ylläpidolle. Jakso suunnittelee {signed(-plannedKg, 2)} kg/vko.</>
            ) : (
              <>
                Blokki kestää enintään {allowedKg.toFixed(2)} kg/vko, jakso pyytää{' '}
                {plannedKg.toFixed(2)} kg/vko.
              </>
            )}
            {over && <span className="text-accent"> Säädä Suunnittelu-työkalussa.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
