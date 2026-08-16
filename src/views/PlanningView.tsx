import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, Plus, AlertTriangle, Check, Wand2 } from 'lucide-react'
import type { GoalPeriod, Settings, WeightEntry } from '../types'
import type { TrainingBlock } from '../lib/blocks'
import { getBlocks, pullBlocks } from '../lib/blocks'
import { computeWeightTrend } from '../lib/weight'
import { getPeriods, addPeriod, updatePeriod } from '../lib/goalPeriods'
import {
  INTENTS, intentOf, buildBlockPlans, findClashes, plannedWeeklyLossKg, targetWeightFor,
} from '../lib/planning'
import type { Clash } from '../lib/planning'
import { toISO, formatDateShort, daysBetween, addDays } from '../lib/dates'
import { GoalPeriodModal } from '../components/GoalPeriodModal'
import { useAuth } from '../contexts/AuthContext'
import { Card, Button } from '../components/ui'

// Training and nutrition are planned here, against each other.
//
// They stay two objects with their own dates — see lib/planning.ts for why —
// so this screen's job is to put them on one axis, name the conflicts, and
// make the fix a button rather than a note to self.

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

const PERIOD_COLOR: Record<string, string> = {
  cut: '#22d3ee',
  maintenance: '#60a5fa',
  refill: '#a78bfa',
  bulk: '#34d399',
}

interface Props {
  settings: Settings
  setSettings: (s: Settings) => void
  weights: WeightEntry[]
}

export function PlanningView({ settings, setSettings, weights }: Props) {
  const { user } = useAuth()
  const todayISO = toISO(new Date())
  const [blocks, setBlocks] = useState<TrainingBlock[]>(() => getBlocks())
  const [modal, setModal] = useState<
    | { mode: 'create-for-block'; block: TrainingBlock }
    | { mode: 'edit'; initial: GoalPeriod }
    | null
  >(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    pullBlocks(user.id).then((b) => { if (alive) setBlocks(b) })
    return () => { alive = false }
  }, [user])

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const periods = useMemo(() => getPeriods(settings), [settings])
  // The tolerances are shares of body weight, so they need a body weight. The
  // smoothed trend is the honest one; fall back to the active period's start.
  const bodyWeight = trend.currentTrend ?? periods[periods.length - 1]?.startWeight ?? 75

  const clashes = useMemo(
    () => findClashes(settings, blocks, bodyWeight),
    [settings, blocks, bodyWeight],
  )
  const plans = useMemo(
    () => buildBlockPlans(settings, blocks, bodyWeight),
    [settings, blocks, bodyWeight],
  )

  const relax = (c: Clash) => {
    if (c.suggestedTargetWeight === null) return
    setSettings(updatePeriod(settings, c.period.id, { targetWeight: c.suggestedTargetWeight }))
  }
  const toMaintenance = (c: Clash) => {
    setSettings(
      updatePeriod(settings, c.period.id, {
        type: 'maintenance',
        targetWeight: c.period.startWeight,
      }),
    )
  }

  return (
    <div className="flex min-h-dvh flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div>
        <div className="mb-1 font-mono text-[10px] tracking-[0.32em] text-fg-muted">FRIDAY</div>
        <h1 className="m-0 font-display text-[22px] font-extrabold tracking-[-0.015em] text-white">
          Suunnittelu
        </h1>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-fg-faint">
          Treeniblokit ja ravintojaksot samalla aikajanalla. Ne pysyvät erillisinä — blokki ja
          ravintovaihe kulkevat oikeasti eri kelloilla — mutta täällä ne katsotaan yhdessä.
        </p>
      </div>

      <Timeline periods={periods} blocks={blocks} todayISO={todayISO} />

      {/* ── Conflicts ─────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-text">
          Ristiriidat
        </h2>
        {clashes.length === 0 ? (
          <Card variant="glass" className="flex items-center gap-2.5 px-4 py-3.5">
            <Check size={15} className="flex-shrink-0 text-[#7fd694]" />
            <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
              {blocks.length === 0
                ? 'Ei treeniblokkeja vielä. Lisää blokkeja Workout-työkalussa, niin ne ilmestyvät tähän.'
                : 'Ravintojaksot ja treeniblokit ovat linjassa keskenään.'}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {clashes.map((c) => (
              <ClashCard
                key={`${c.period.id}-${c.block.id}`}
                clash={c}
                onRelax={() => relax(c)}
                onMaintenance={() => toMaintenance(c)}
                onEdit={() => setModal({ mode: 'edit', initial: c.period })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Per block ─────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 font-display text-[15px] font-bold tracking-[-0.02em] text-text">
          Blokit
        </h2>
        {plans.length === 0 ? (
          <Card variant="glass" className="px-4 py-3.5">
            <p className="m-0 text-[12px] text-fg-muted">
              Blokit luodaan Workout-työkalun kalenterista.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {plans.map((p) => {
              const days = daysBetween(p.block.startDate, p.block.endDate) + 1
              const past = p.block.endDate < todayISO
              return (
                <Card key={p.block.id} variant="glass" className={past ? 'opacity-55' : ''}>
                  <div className="flex items-start gap-2.5">
                    <div
                      className="mt-0.5 h-8 w-1 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: p.block.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-text">
                        {p.block.name || p.spec.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-fg-faint">
                        {p.spec.label} · {formatDateShort(p.block.startDate)} – {formatDateShort(p.block.endDate)} · {days} pv
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 rounded-[8px] border border-white/[0.07] bg-black/30 p-2.5">
                    <Row
                      k="Vaje enintään"
                      v={p.allowedKg === null ? 'ei vajetta' : `${p.allowedKg.toFixed(2)} kg/vko`}
                    />
                    <Row k="Proteiini väh." v={`${p.proteinTargetG} g/pv`} />
                    <Row
                      k="Ravintojakso"
                      v={
                        p.periods.length === 0
                          ? '—'
                          : p.periods.map((x) => `${x.type} ${plannedWeeklyLossKg(x) > 0 ? `−${plannedWeeklyLossKg(x).toFixed(2)}` : '±0.00'} kg/vko`).join(', ')
                      }
                    />
                  </div>

                  {p.periods.length === 0 && !past && (
                    <Button
                      variant="action"
                      className="mt-2.5 w-full"
                      onClick={() => setModal({ mode: 'create-for-block', block: p.block })}
                    >
                      <Plus size={13} />
                      Aseta ravintojakso tälle blokille
                    </Button>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <details>
        <summary className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-fg-ghost [list-style:none]">
          ▸ Mistä rajat tulevat
        </summary>
        <div className="mt-2 px-0.5 text-[11px] leading-[1.7] text-fg-faint">
          <p className="m-0 mb-1.5">
            Jokainen blokin tarkoitus kantaa ylärajan sille, kuinka nopeaa painonpudotusta se
            kestää, prosentteina kehonpainosta viikossa. Raja kerrotaan nykyisellä trendipainollasi
            ({bodyWeight.toFixed(1)} kg), joten se elää painosi mukana.
          </p>
          <p className="m-0 mb-1.5">
            Varoitus tulee kun jakso ylittää rajan, ja ristiriita kun se ylittää sen yli 25 %:lla.
            Alle viikon päällekkäisyyttä ei lasketa.
          </p>
          <p className="m-0">
            Luvut ovat kirjallisuuden yleistä linjaa, eivät mittauksia sinusta. Ne ovat tarkoitettu
            lähtökohdaksi — kun blokki on ajettu ravintojakson rinnalla, toteutunut tahti näkyy
            Analyysissä ja rajaa kannattaa säätää sen mukaan.
          </p>
        </div>
      </details>

      {modal?.mode === 'create-for-block' && (
        <GoalPeriodModal
          defaultStartDate={
            modal.block.startDate > todayISO ? modal.block.startDate : todayISO
          }
          defaultEndDate={modal.block.endDate}
          defaultStartWeight={Math.round(bodyWeight * 10) / 10}
          defaultTargetWeight={targetWeightFor(
            intentOf(modal.block),
            Math.round(bodyWeight * 10) / 10,
            Math.max(
              1,
              daysBetween(
                modal.block.startDate > todayISO ? modal.block.startDate : todayISO,
                modal.block.endDate,
              ) + 1,
            ),
          )}
          defaultType={INTENTS[intentOf(modal.block)].maxWeeklyLossPct === null ? 'maintenance' : 'cut'}
          defaultLabel={modal.block.name || INTENTS[intentOf(modal.block)].label}
          blockId={modal.block.id}
          onSave={(p) => {
            setSettings(addPeriod(settings, p))
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === 'edit' && (
        <GoalPeriodModal
          initial={modal.initial}
          onSave={(p) => {
            setSettings(updatePeriod(settings, modal.initial.id, p))
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px] text-[12px]">
      <span className="flex-shrink-0 text-muted">{k}</span>
      <span className="truncate text-right tabular-nums text-text">{v}</span>
    </div>
  )
}

/** Two lanes on one axis. Scrolls horizontally rather than compressing months
 *  into an unreadable smear on a phone. */
function Timeline({
  periods,
  blocks,
  todayISO,
}: {
  periods: GoalPeriod[]
  blocks: TrainingBlock[]
  todayISO: string
}) {
  const all = [
    ...periods.map((p) => ({ start: p.startDate, end: p.endDate })),
    ...blocks.map((b) => ({ start: b.startDate, end: b.endDate })),
  ]
  if (all.length === 0) return null

  const min = all.reduce((a, b) => (a.start <= b.start ? a : b)).start
  const max = all.reduce((a, b) => (a.end >= b.end ? a : b)).end
  // Pad so bars never touch the edges, and so "today" is visible when it sits
  // just outside the planned range.
  const from = min < todayISO ? min : addDays(todayISO, -3)
  const to = max > todayISO ? max : addDays(todayISO, 3)
  const total = Math.max(1, daysBetween(from, to) + 1)
  const PX_PER_DAY = 4
  const width = total * PX_PER_DAY

  const x = (d: string) => daysBetween(from, d) * PX_PER_DAY
  const w = (s: string, e: string) => Math.max(6, (daysBetween(s, e) + 1) * PX_PER_DAY)

  const bar = 'absolute flex items-center overflow-hidden rounded-[5px] px-1.5 text-[9px] font-semibold'

  // A season is months long and the phone is 390px wide, so the axis scrolls.
  // Open it where the user is, not at the start of history.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = Math.max(0, daysBetween(from, todayISO) * PX_PER_DAY - el.clientWidth / 2)
  }, [from, todayISO])

  return (
    <Card variant="glass" className="p-3">
      <div className={cardLabel}>Aikajana</div>
      <div ref={scroller} className="overflow-x-auto">
        <div className="relative" style={{ width, minWidth: '100%' }}>
          {/* today marker — its label sits in a lane of its own above the
              bars, so it never lands on top of one */}
          <div className="relative h-[13px]">
            {todayISO >= from && todayISO <= to && (
              <span
                className="absolute top-0 font-mono text-[8px] uppercase text-white/60"
                style={{ left: x(todayISO) + 3 }}
              >
                tänään
              </span>
            )}
          </div>
          {todayISO >= from && todayISO <= to && (
            <div
              className="absolute top-[13px] z-10 h-[60px] w-px bg-white/45"
              style={{ left: x(todayISO) }}
            />
          )}

          <div className="relative h-[30px]">
            {periods.map((p) => (
              <div
                key={p.id}
                className={`${bar} top-[11px] h-[17px]`}
                style={{
                  left: x(p.startDate),
                  width: w(p.startDate, p.endDate),
                  backgroundColor: `${PERIOD_COLOR[p.type] ?? '#22d3ee'}30`,
                  border: `1px solid ${PERIOD_COLOR[p.type] ?? '#22d3ee'}70`,
                  color: PERIOD_COLOR[p.type] ?? '#22d3ee',
                }}
                title={`${p.type} ${p.startDate} – ${p.endDate}`}
              >
                <span className="truncate">{p.label || p.type}</span>
              </div>
            ))}
          </div>

          <div className="relative h-[30px]">
            {blocks.map((b) => (
              <div
                key={b.id}
                className={`${bar} top-1 h-[17px]`}
                style={{
                  left: x(b.startDate),
                  width: w(b.startDate, b.endDate),
                  backgroundColor: `${b.color}30`,
                  border: `1px solid ${b.color}70`,
                  color: b.color,
                }}
                title={`${b.name} ${b.startDate} – ${b.endDate}`}
              >
                <span className="truncate">{b.name || INTENTS[intentOf(b)].label}</span>
              </div>
            ))}
          </div>

          <div className="mt-1 flex justify-between font-mono text-[8px] text-fg-ghost">
            <span>{formatDateShort(from)}</span>
            <span>{formatDateShort(to)}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-3 border-t border-white/[0.06] pt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-fg-ghost">
        <span>ylä: ravinto</span>
        <span>ala: treeni</span>
      </div>
    </Card>
  )
}

function ClashCard({
  clash,
  onRelax,
  onMaintenance,
  onEdit,
}: {
  clash: Clash
  onRelax: () => void
  onMaintenance: () => void
  onEdit: () => void
}) {
  const hard = clash.severity === 'conflict'
  const spec = INTENTS[clash.intent]
  return (
    <div
      className="rounded-card border px-4 py-3.5"
      style={{
        backgroundColor: hard ? 'rgba(248,113,113,0.06)' : 'rgba(232,184,90,0.06)',
        borderColor: hard ? 'rgba(248,113,113,0.22)' : 'rgba(232,184,90,0.22)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className={`mt-0.5 flex-shrink-0 ${hard ? 'text-danger' : 'text-accent'}`} />
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-bold text-text">
            {spec.label} vs. {clash.period.label || clash.period.type}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-normal text-fg-muted">{clash.message}</p>
          <p className="m-0 mt-1.5 text-[12px] leading-normal text-fg-faint">{spec.advice}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {clash.allowedKg !== null && clash.suggestedTargetWeight !== null && (
          <Button variant="action" onClick={onRelax} className="flex-1">
            <Wand2 size={13} />
            Loivenna → {clash.suggestedTargetWeight.toFixed(1)} kg
          </Button>
        )}
        {clash.allowedKg === null && (
          <Button variant="action" onClick={onMaintenance} className="flex-1">
            <Wand2 size={13} />
            Vaihda ylläpidoksi
          </Button>
        )}
        <Button variant="action" onClick={onEdit}>
          <CalendarRange size={13} />
          Muokkaa
        </Button>
      </div>
    </div>
  )
}
