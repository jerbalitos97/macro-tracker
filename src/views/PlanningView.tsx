import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, Plus, AlertTriangle, Check, Wand2, Trash2, CheckCircle2, ChevronRight } from 'lucide-react'
import type { DayType, GoalPeriod, Settings, WeightEntry } from '../types'
import type { TrainingBlock } from '../lib/blocks'
import {
  getBlocks, pullBlocks, newBlock, saveBlockLocal, deleteBlockLocal, blockForDate,
  syncBlockCloud, deleteBlockCloud,
} from '../lib/blocks'
import { computeWeightTrend } from '../lib/weight'
import {
  getPeriods, addPeriod, updatePeriod, removePeriod, endActivePeriod, getActiveGoal, isPeriodLive,
} from '../lib/goalPeriods'
import { BlockEditorSheet } from '../components/workout/BlockEditorSheet'
import {
  INTENTS, intentOf, buildBlockPlans, findClashes, plannedWeeklyLossKg, targetWeightFor,
  recommendProtein,
} from '../lib/planning'
import type { Clash } from '../lib/planning'
import { toISO, formatDateShort, daysBetween, addDays, getWeekdayNum } from '../lib/dates'
import { GoalPeriodModal } from '../components/GoalPeriodModal'
import { useAuth } from '../contexts/AuthContext'
import { Card, Button, snack } from '../components/ui'
import { guardSettings } from '../lib/maintenanceGuard'

// Training and nutrition are planned here, against each other.
//
// They stay two objects with their own dates — see lib/planning.ts for why —
// so this screen's job is to put them on one axis, name the conflicts, and
// make the fix a button rather than a note to self.

const cardLabel = 'mb-2.5 text-[16px] font-medium leading-6 text-text'
const sectionTitle = 'm-0 text-[18px] font-medium leading-6 text-text'
const sectionHead = 'flex min-h-11 items-center justify-between gap-2 px-1 pt-2'
// Tonal button in the Planning tint (amber), as in the mockup's section heads.
const tonalBtn =
  'inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full bg-[rgba(232,184,90,0.18)] px-4 text-[14px] font-medium text-[#f5e6c4]'
const textBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-transparent px-3 text-[14px] font-semibold text-[#22d3ee]'
const listGroup = 'flex flex-col gap-0.5 overflow-hidden rounded-[24px]'
const listRow = 'bg-[var(--surface-1)] px-4 py-2.5'
const inputCls =
  'h-11 w-full rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-3 text-base text-text [color-scheme:dark]'

const PERIOD_TYPE_LABEL: Record<string, string> = {
  cut: 'Cut',
  maintenance: 'Maintenance',
  refill: 'Refill',
  bulk: 'Bulk',
}

const TDEE_LABELS: Record<string, string> = {
  rest: 'Lepo',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

const DOW_NAMES: Record<number, string> = {
  1: 'Maanantai', 2: 'Tiistai', 3: 'Keskiviikko',
  4: 'Torstai', 5: 'Perjantai', 6: 'Lauantai', 0: 'Sunnuntai',
}

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
    | { mode: 'create' }
    | { mode: 'edit'; initial: GoalPeriod }
    | null
  >(null)
  const [blockEdit, setBlockEdit] = useState<{ block: TrainingBlock; isNew: boolean } | null>(null)
  const [tab, setTab] = useState<'season' | 'basics'>('season')
  // Undo runs seconds later, after other edits may have landed; it has to
  // patch the settings as they are then, not as they were when the snack
  // was raised.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const saveBlock = (b: TrainingBlock) => {
    setBlocks(saveBlockLocal(b))
    if (user) syncBlockCloud(user.id, b)
    setBlockEdit(null)
  }
  const removeBlock = (id: string) => {
    setBlocks(deleteBlockLocal(id))
    if (user) deleteBlockCloud(user.id, id)
    setBlockEdit(null)
  }

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

  // What the goal in force actually asks for, in the numbers you'd want before
  // changing it. This card used to live in Fitness → Asetukset; it belongs
  // with the plan it describes.
  const goal = getActiveGoal(settings, todayISO)
  const goalPlansDeficit = goal.type === 'cut' || goal.type === 'bulk'
  const weekdayCount = (() => {
    let n = 0
    for (let i = 0; i < goal.totalDays; i++) {
      const d = getWeekdayNum(addDays(goal.startDate, i))
      if (d !== 0 && d !== 6) n++
    }
    return n
  })()
  const goalWeekdayDeficit =
    goal.weekendMaintenance && weekdayCount > 0 ? goal.totalDeficitKcal / weekdayCount : 0

  // Protein moves with both the training block and how hard the nutrition
  // phase is pushing, so it is derived rather than typed — but it stays
  // overridable, because eating above the number on purpose is a legitimate
  // way to cover the days that fall short.
  const todayBlock = blockForDate(blocks, todayISO)
  const protein = recommendProtein({
    bodyWeightKg: bodyWeight,
    intent: todayBlock ? intentOf(todayBlock) : null,
    periodType: goal.type,
    plannedWeeklyLossKg: goal.weeklyRateKg,
  })

  const relax = (c: Clash) => {
    if (c.suggestedTargetWeight === null) return
    setSettings(updatePeriod(settings, c.period.id, { targetWeight: c.suggestedTargetWeight }))
  }
  const deletePeriod = (p: GoalPeriod) => {
    setSettings(removePeriod(settings, p.id))
    snack({
      text: 'Jakso poistettu',
      onAction: () => {
        const cur = settingsRef.current
        if ((cur.goalPeriods ?? []).some((x) => x.id === p.id)) return
        setSettings({ ...cur, goalPeriods: [...(cur.goalPeriods ?? []), p] })
      },
    })
  }
  const endCurrent = () => {
    const before = settings.goalPeriods
    const next = endActivePeriod(settings, todayISO, 'achieved')
    if (next === settings) return
    // The one period endActivePeriod changed, as it was before.
    const prev = (before ?? []).find((b) => {
      const n = next.goalPeriods?.find((x) => x.id === b.id)
      return n && (n.status !== b.status || n.endDate !== b.endDate)
    })
    setSettings(next)
    snack({
      text: 'Tavoite päätetty',
      onAction: () => {
        const cur = settingsRef.current
        if (prev) setSettings(updatePeriod(cur, prev.id, { status: prev.status, endDate: prev.endDate }))
        // Legacy goal: ending it was what turned it into a stored period.
        else if ((before ?? []).length === 0) setSettings({ ...cur, goalPeriods: before })
      },
    })
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
    <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-2">
      {/* One long scroll mixed "what is in force today" with settings touched
          twice a year. Two tabs separate them; the data and the mechanisms
          behind them are unchanged. */}
      <div role="tablist" className="flex gap-1 rounded-[24px] bg-[var(--surface-2)] p-1">
        {([['season', 'Kausi'], ['basics', 'Perusarvot']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-10 flex-1 rounded-[20px] text-[14px] font-medium ${
              tab === id ? 'bg-[rgba(34,211,238,0.18)] text-[#a5f3fc]' : 'bg-transparent text-fg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'season' && (
      <>
      {/* ── What is in force today ────────────────────────────────
          Block, nutrition phase and the day's asks in one place. Everything
          here is derived, so it moves the moment any input does: change the
          block, log a weigh-in, edit the period — this card is the proof. */}
      <section
        className="flex flex-col gap-3.5 border border-[rgba(232,184,90,0.35)] p-5"
        style={{
          borderRadius: '32px 32px 32px 12px',
          background: 'linear-gradient(135deg, rgba(232,184,90,0.24), rgba(167,139,250,0.22))',
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] leading-5 text-[#f5e6c4]">
            Voimassa tänään · {formatDateShort(todayISO)}
          </span>
          <span className="flex items-center gap-2.5 text-[26px] font-medium leading-8 text-text">
            {todayBlock && (
              <span
                aria-hidden
                className="h-6 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: todayBlock.color }}
              />
            )}
            <span className="min-w-0 truncate">
              {todayBlock ? (todayBlock.name || INTENTS[intentOf(todayBlock)].label) : 'Ei treeniblokkia'}
            </span>
          </span>
          {todayBlock && (
            <span className="self-start rounded-lg bg-[rgba(5,6,12,0.4)] px-2.5 py-1 text-[12px] font-semibold text-text">
              {INTENTS[intentOf(todayBlock)].label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            k="Ravintovaihe"
            v={`${PERIOD_TYPE_LABEL[goal.type]} · ${goal.startWeight.toFixed(1)} → ${goal.targetWeight.toFixed(1)}`}
            sub={`${formatDateShort(goal.startDate)} – ${formatDateShort(goal.endDate)} · päivä ${goal.elapsedDays}/${goal.totalDays}`}
          />
          <Tile
            k="Tahti"
            v={goal.weeklyRateKg > 0 ? `−${goal.weeklyRateKg.toFixed(2)} kg/vko` : 'ylläpito'}
            sub={
              todayBlock
                ? INTENTS[intentOf(todayBlock)].maxWeeklyLossPct === null
                  ? 'blokki ei siedä vajetta'
                  : `blokin katto ${((bodyWeight * (INTENTS[intentOf(todayBlock)].maxWeeklyLossPct ?? 0)) / 100).toFixed(2)} kg/vko`
                : undefined
            }
          />
          <Tile
            k="Proteiini"
            v={`${settings.proteinTarget} g/pv`}
            sub={
              settings.proteinTarget === protein.grams
                ? `suositus ${protein.grams} g · ${protein.gramsPerKg} g/kg`
                : `suositus ${protein.grams} g — omasi ${settings.proteinTarget > protein.grams ? '+' : '−'}${Math.abs(settings.proteinTarget - protein.grams)} g`
            }
          />
          <Tile k="Paino laskennassa" v={`${bodyWeight.toFixed(1)} kg`} sub="7 pv liukuva ka." />
        </div>
        {clashes.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-[#452826] px-3 py-2 text-[14px] text-[#FFDAD6]">
            <AlertTriangle size={16} className="flex-shrink-0 text-[#FFB4AB]" />
            {clashes.length} ristiriita{clashes.length === 1 ? '' : 'a'} alla
          </div>
        )}
      </section>

      <Timeline periods={periods} blocks={blocks} todayISO={todayISO} />

      {/* ── Conflicts ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Ristiriidat</h2>
        </div>
        {clashes.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-[20px] bg-[rgba(52,211,153,0.14)] px-4 py-3.5 text-[#bbf7d0]">
            <Check size={20} className="flex-shrink-0" />
            <p className="m-0 text-[14px] leading-5">
              {blocks.length === 0
                ? 'Ei treeniblokkeja vielä. Lisää blokkeja Workout-työkalussa, niin ne ilmestyvät tähän.'
                : 'Ravintojaksot ja treeniblokit ovat linjassa keskenään.'}
            </p>
          </div>
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
      <div className="flex flex-col gap-2">
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Treeniblokit</h2>
          <button
            type="button"
            className={tonalBtn}
            onClick={() =>
              setBlockEdit({
                block: newBlock(
                  blocks.length > 0
                    ? addDays(blocks.reduce((a, b) => (a.endDate >= b.endDate ? a : b)).endDate, 1)
                    : todayISO,
                ),
                isNew: true,
              })
            }
          >
            <Plus size={16} />
            Uusi blokki
          </button>
        </div>
        {plans.length === 0 ? (
          <Card className="!p-4">
            <p className="m-0 text-[14px] leading-5 text-fg-muted">
              Ei blokkeja vielä. Luo ensimmäinen yltä — ne näkyvät sen jälkeen väreinä Workout-kalenterissa.
            </p>
          </Card>
        ) : (
          <div className={listGroup}>
            {plans.map((p) => {
              const days = daysBetween(p.block.startDate, p.block.endDate) + 1
              const past = p.block.endDate < todayISO
              return (
                <div key={p.block.id} className={`${listRow} ${past ? 'opacity-55' : ''}`}>
                  <button
                    onClick={() => setBlockEdit({ block: p.block, isNew: false })}
                    className="flex min-h-12 w-full items-center gap-3.5 bg-transparent text-left"
                  >
                    <span
                      aria-hidden
                      className="h-10 w-3 flex-shrink-0 rounded-md"
                      style={{ backgroundColor: p.block.color }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[16px] leading-6 text-text">
                        {p.block.name || p.spec.label}
                      </span>
                      <span className="text-[14px] leading-5 text-fg-muted">
                        {p.spec.label} · {formatDateShort(p.block.startDate)} – {formatDateShort(p.block.endDate)} · {days} pv
                      </span>
                      <span className="text-[14px] leading-5 text-fg-muted">
                        Vaje enintään {p.allowedKg === null ? 'ei vajetta' : `${p.allowedKg.toFixed(2)} kg/vko`} · proteiini väh. {p.proteinTargetG} g/pv
                      </span>
                      <span className="text-[14px] leading-5 text-fg-muted">
                        Ravintojakso:{' '}
                        {p.periods.length === 0
                          ? '—'
                          : p.periods.map((x) => `${x.type} ${plannedWeeklyLossKg(x) > 0 ? `−${plannedWeeklyLossKg(x).toFixed(2)}` : '±0.00'} kg/vko`).join(', ')}
                      </span>
                    </span>
                    <ChevronRight size={20} className="flex-shrink-0 text-fg-muted" />
                  </button>

                  {p.periods.length === 0 && !past && (
                    <button
                      type="button"
                      className={`${textBtn} -ml-3 mt-1`}
                      onClick={() => setModal({ mode: 'create-for-block', block: p.block })}
                    >
                      <Plus size={16} />
                      Aseta ravintojakso tälle blokille
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Nutrition periods ─────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Ravintojaksot</h2>
          <button type="button" className={tonalBtn} onClick={() => setModal({ mode: 'create' })}>
            <Plus size={16} />
            Uusi jakso
          </button>
        </div>
        <div className={listGroup}>
          {periods.map((p) => {
            // Voimassa, ei pelkkä 'active': etukäteen kirjattu jakso ohjaa
            // budjettia omana päivänään ilman tilan kääntämistä, ja silloin
            // sen kuuluu näyttää siltä. Merkintä on myös se joka piilottaa
            // roskakorin — menossa olevaa jaksoa ei poisteta vahingossa.
            const isActive = isPeriodLive(p, todayISO)
            const color = PERIOD_COLOR[p.type] ?? '#22d3ee'
            return (
              <div
                key={p.id}
                onClick={() => setModal({ mode: 'edit', initial: p })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setModal({ mode: 'edit', initial: p }) }}
                className={`${listRow} flex min-h-16 cursor-pointer items-center gap-3`}
              >
                <span
                  aria-hidden
                  className="h-10 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: color, opacity: isActive ? 1 : 0.4 }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-1.5 text-[16px] leading-6 text-text">
                    <span>{PERIOD_TYPE_LABEL[p.type]}</span>
                    <span className="font-mono text-[14px] text-fg-muted">
                      {p.startWeight.toFixed(1)} → {p.targetWeight.toFixed(1)} kg
                    </span>
                  </div>
                  <div className="truncate text-[14px] leading-5 text-fg-muted">
                    {formatDateShort(p.startDate)} – {formatDateShort(p.endDate)}
                    {p.label ? ` · ${p.label}` : ''}
                  </div>
                </div>
                <span
                  className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                  style={{
                    backgroundColor: isActive ? `${color}29` : 'rgba(255,255,255,0.08)',
                    color: isActive ? color : '#BFC8CA',
                  }}
                >
                  {isActive
                    ? 'Voimassa'
                    : p.status === 'planned'
                      ? 'Suunniteltu'
                      : p.status === 'achieved'
                        ? 'Saavutettu'
                        : 'Päätetty'}
                </span>
                {!isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePeriod(p)
                    }}
                    className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-transparent text-fg-muted"
                    aria-label="Poista jakso"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button type="button" className={`${textBtn} self-start`} onClick={endCurrent}>
          <CheckCircle2 size={16} />
          Päätä nykyinen tavoite
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {/* The identity of the active period is already in "Voimassa tänään"
            at the top; what is left here is the arithmetic it implies. */}
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Mitä aktiivinen jakso vaatii</h2>
        </div>
        <Card className="!p-4">
          <div>
            <Row k="Muutos" v={`${goal.kgToChange.toFixed(1)} kg`} />
            {goalPlansDeficit ? (
              <>
                <Row k="Kokonaisvaje" v={`${Math.round(goal.totalDeficitKcal).toLocaleString('fi-FI')} kcal`} />
                <Row
                  k={goal.weekendMaintenance ? 'Päivävaje (arki)' : 'Päivävaje (perus)'}
                  v={`${Math.round(goal.weekendMaintenance ? goalWeekdayDeficit : goal.dailyDeficitKcal)} kcal / pv`}
                />
              </>
            ) : (
              <Row k="Vaje" v="ei vajetta — ylläpito" />
            )}
            <Row k="Tempo" v={`${goal.weeklyRateKg.toFixed(2)} kg / vko`} />
          </div>
          {goal.weekendMaintenance && (
            <p className="m-0 mt-2 text-[14px] leading-5 text-fg-muted">
              Viikonloput ylläpidolla — koko vaje on jalkautettu arkipäiville.
            </p>
          )}
        </Card>
      </div>

      </>
      )}

      {tab === 'basics' && (
      <>
      {/* ── Physiology ────────────────────────────────────────────
          TDEE, the weekly rhythm and the protein target decide every daily
          budget, so they belong with the planning rather than in an
          app-settings drawer. */}
      <div className="flex flex-col gap-2">
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Kulutus päivätyypeittäin</h2>
        </div>
        <Card className="!p-4">
          {(['rest', 'single', 'double', 'volleyball'] as const).map((key) => (
            <NumField
              key={key}
              id={`tdee-${key}`}
              label={TDEE_LABELS[key]}
              value={settings.tdee[key]}
              min={800}
              max={8000}
              onCommit={(n) =>
                n != null && setSettings({ ...settings, tdee: { ...settings.tdee, [key]: n } })
              }
            />
          ))}
        </Card>

        {/* Ylläpidon vahti. Parametrit täällä, arvio ja ehdotus Analyysissa —
            täällä suunnitellaan, muualla raportoidaan. */}
        <GuardCard settings={settings} setSettings={setSettings} />

        <div className={sectionHead}>
          <h2 className={sectionTitle}>Viikkorytmi</h2>
        </div>
        <Card className="!p-4">
          <div className="mb-1 text-[14px] leading-5 text-fg-muted">
            Mitä päivätyyppiä kukin viikonpäivä oletusarvoisesti on
          </div>
          {([1, 2, 3, 4, 5, 6, 0] as number[]).map((dow) => (
            <div key={dow} className="mt-1.5 flex items-center justify-between gap-3">
              <label className="text-[16px] leading-6 text-text">{DOW_NAMES[dow]}</label>
              <select
                value={settings.weeklyPattern[dow]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weeklyPattern: { ...settings.weeklyPattern, [dow]: e.target.value as DayType },
                  })
                }
                className={`${inputCls} !w-[140px]`}
              >
                <option value="rest">Lepo</option>
                <option value="single">1 treeni</option>
                <option value="double">2 treeniä</option>
                <option value="volleyball">Volleyball</option>
              </select>
            </div>
          ))}
        </Card>

        {/* Height, birth year and sex are here for one reason: they let the
            workout burn estimate use your own resting rate instead of the
            generic 1 kcal/kg/h constant, which runs high for most people. */}
        <div className={sectionHead}>
          <h2 className={sectionTitle}>Kehon mitat</h2>
        </div>
        <Card className="!p-4">
          <div className="mb-1 text-[14px] leading-5 text-fg-muted">
            Käytetään treenin kulutusarvioon. Ilman pituutta ja ikää arvio putoaa
            karkeampaan vakiokaavaan.
          </div>
          <NumField
            id="height-cm"
            label="Pituus (cm)"
            value={settings.heightCm}
            min={100}
            max={250}
            allowEmpty
            onCommit={(n) => setSettings({ ...settings, heightCm: n })}
          />
          <NumField
            id="birth-year"
            label="Syntymävuosi"
            value={settings.birthYear}
            min={1900}
            max={new Date().getFullYear()}
            allowEmpty
            onCommit={(n) => setSettings({ ...settings, birthYear: n })}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="text-[16px] leading-6 text-text" htmlFor="sex">Perusaineenvaihdunnan kaava</label>
            <select
              id="sex"
              value={settings.sex ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sex: e.target.value === '' ? undefined : (e.target.value as 'male' | 'female'),
                })
              }
              className={`${inputCls} !w-[130px]`}
            >
              <option value="">Ei asetettu</option>
              <option value="male">Mies</option>
              <option value="female">Nainen</option>
            </select>
          </div>
        </Card>

        <div className={sectionHead}>
          <h2 className={sectionTitle}>Proteiinitavoite</h2>
        </div>
        <Card className="!p-4">
          <NumField
            id="protein-target"
            label="Tavoite (g/pv)"
            value={settings.proteinTarget}
            min={30}
            max={500}
            onCommit={(n) => n != null && setSettings({ ...settings, proteinTarget: n })}
          />

          <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3">
            <div className="flex items-baseline justify-between text-[16px]">
              <span className="text-text">Suositus</span>
              <span className="font-mono font-medium text-[#f5e6c4]">
                {protein.grams} g/pv
                <span className="ml-1 text-[14px] font-normal text-fg-muted">({protein.gramsPerKg} g/kg)</span>
              </span>
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {protein.reasons.map((r) => (
                <div key={r} className="text-[14px] leading-5 text-fg-muted">· {r}</div>
              ))}
            </div>
            {settings.proteinTarget !== protein.grams && (
              <Button
                variant="action"
                className="mt-2.5 w-full"
                onClick={() => setSettings({ ...settings, proteinTarget: protein.grams })}
              >
                Ota suositus käyttöön
              </Button>
            )}
          </div>

          {settings.proteinTarget > protein.grams && (
            <p className="m-0 mt-2 text-[14px] leading-5 text-fg-muted">
              Tavoitteesi on {settings.proteinTarget - protein.grams} g suosituksen yli. Jos se on
              tarkoituksellinen puskuri niitä päiviä varten jolloin proteiini jää vajaaksi, se
              toimii — keskiarvo on se mikä ratkaisee, ei yksittäinen päivä.
            </p>
          )}
          {settings.proteinTarget < protein.grams && (
            <p className="m-0 mt-2 text-[14px] leading-5 text-fg-muted">
              Tavoitteesi on {protein.grams - settings.proteinTarget} g suosituksen alle. Vajeella
              proteiini on se mikä estää kehoa ottamasta energiavajetta lihaksesta.
            </p>
          )}
        </Card>
      </div>

      <details>
        <summary className="flex min-h-11 cursor-pointer select-none items-center gap-1 px-1 text-[14px] font-medium text-[#22d3ee] [list-style:none]">
          ▸ Mistä rajat tulevat
        </summary>
        <div className="mt-1 px-1 text-[14px] leading-5 text-fg-muted">
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

      </>
      )}

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
      {modal?.mode === 'create' && (
        <GoalPeriodModal
          defaultStartDate={
            periods.length > 0
              ? periods.reduce((a, b) => (a.endDate >= b.endDate ? a : b)).endDate
              : todayISO
          }
          defaultStartWeight={Math.round(bodyWeight * 10) / 10}
          onSave={(p) => {
            setSettings(addPeriod(settings, p))
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {blockEdit && (
        <BlockEditorSheet
          block={blockEdit.block}
          all={blocks}
          isNew={blockEdit.isNew}
          onSave={saveBlock}
          onDelete={() => removeBlock(blockEdit.block.id)}
          onClose={() => setBlockEdit(null)}
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
    <div className="flex min-h-10 items-baseline justify-between gap-3 py-1.5 text-[16px] leading-6">
      <span className="flex-shrink-0 text-text">{k}</span>
      <span className="truncate text-right font-mono font-medium text-text">{v}</span>
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

  const bar = 'absolute flex items-center overflow-hidden rounded-[5px] px-1.5 text-[12px] font-semibold'

  // A season is months long and the phone is 390px wide, so the axis scrolls.
  // Open it where the user is, not at the start of history.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = Math.max(0, daysBetween(from, todayISO) * PX_PER_DAY - el.clientWidth / 2)
  }, [from, todayISO])

  return (
    <Card className="!p-4">
      <h2 className={cardLabel}>Aikajana</h2>
      <div ref={scroller} className="overflow-x-auto">
        <div className="relative" style={{ width, minWidth: '100%' }}>
          {/* today marker — its label sits in a lane of its own above the
              bars, so it never lands on top of one */}
          <div className="relative h-4">
            {todayISO >= from && todayISO <= to && (
              <span
                className="absolute top-0 text-[12px] leading-4 text-text"
                style={{ left: x(todayISO) + 3 }}
              >
                tänään
              </span>
            )}
          </div>
          {todayISO >= from && todayISO <= to && (
            <div
              className="absolute top-4 z-10 h-[60px] w-0.5 bg-white"
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

        </div>
      </div>
      {/* Outside the scroller: inside it the right-hand date sat at the far end
          of the scrollable width and got clipped by the viewport. */}
      <div className="mt-1 flex justify-between text-[12px] leading-4 text-fg-muted">
        <span>{formatDateShort(from)}</span>
        <span>{formatDateShort(to)}</span>
      </div>
      <div className="mt-2 flex gap-3 border-t border-white/[0.06] pt-2 text-[12px] leading-4 text-fg-muted">
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
      role="alert"
      className="flex flex-col gap-2.5 rounded-[24px] p-4"
      style={{
        backgroundColor: hard ? '#452826' : 'rgba(232,184,90,0.16)',
        color: hard ? '#FFDAD6' : '#f5e6c4',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={24} className="flex-shrink-0" style={{ color: hard ? '#FFB4AB' : '#e8b85a' }} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-[16px] font-semibold leading-6">
            {spec.label} vs. {clash.period.label || clash.period.type}
          </p>
          <p className="m-0 text-[14px] leading-5">{clash.message}</p>
          <p className="m-0 text-[14px] leading-5 opacity-80">{spec.advice}</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-1">
        {clash.allowedKg !== null && clash.suggestedTargetWeight !== null && (
          <button type="button" onClick={onRelax} className={`${textBtn} !text-current`}>
            <Wand2 size={16} />
            Loivenna → {clash.suggestedTargetWeight.toFixed(1)} kg
          </button>
        )}
        {clash.allowedKg === null && (
          <button type="button" onClick={onMaintenance} className={`${textBtn} !text-current`}>
            <Wand2 size={16} />
            Vaihda ylläpidoksi
          </button>
        )}
        <button type="button" onClick={onEdit} className={`${textBtn} !text-current`}>
          <CalendarRange size={16} />
          Muokkaa
        </button>
      </div>
    </div>
  )
}

/** A numeric field that keeps what you typed while you type it.
 *
 *  Validating inside onChange looks harmless and is not: a controlled input
 *  whose parent rejects the intermediate value can never receive one. Typing
 *  "1996" into a field guarded by `if (n > 1900)` fails at "1", so the field
 *  is simply unusable. The draft lives here and is validated on blur. */
function NumField({
  id,
  label,
  value,
  min,
  max,
  allowEmpty = false,
  onCommit,
}: {
  id: string
  label: string
  value: number | undefined
  min: number
  max: number
  allowEmpty?: boolean
  onCommit: (n: number | undefined) => void
}) {
  const [text, setText] = useState(value != null ? String(value) : '')
  useEffect(() => { setText(value != null ? String(value) : '') }, [value])

  const commit = () => {
    const raw = text.trim()
    if (raw === '') {
      if (allowEmpty) return onCommit(undefined)
      return setText(value != null ? String(value) : '')
    }
    const n = Number(raw)
    // Out of range reverts rather than clamping: silently turning 19 into 1900
    // would look like the field accepted what was typed.
    if (!Number.isFinite(n) || n < min || n > max) {
      return setText(value != null ? String(value) : '')
    }
    onCommit(Math.round(n))
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <label className="text-[16px] leading-6 text-text" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={allowEmpty ? '—' : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-11 w-[96px] rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-3 text-right font-mono text-base text-text [color-scheme:dark]"
      />
    </div>
  )
}

/** One figure in the hero's 2×2 grid. */
function Tile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[18px] bg-[rgba(5,6,12,0.42)] p-3">
      <span className="text-[12px] leading-4 text-[#e7e2f3]">{k}</span>
      <span className="font-mono text-[18px] font-medium leading-6 text-text">{v}</span>
      {sub && <span className="text-[12px] leading-4 text-[#e7e2f3]">{sub}</span>}
    </div>
  )
}

/** Ylläpidon vahdin parametrit.
 *
 *  Jokainen luku on täällä eikä koodissa, koska jokainen niistä on arvaus
 *  jonka oikea arvo selviää vasta käytössä: neljä punnitusta viikossa voi olla
 *  liikaa vaadittu, kilo voi olla väärä raja, ja kahden viikon putki voi olla
 *  liian hidas tai liian herkkä. Koodiin kovakoodattuna niitä ei säädettäisi
 *  vaan siedettäisiin. */
function GuardCard({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const g = guardSettings(settings.maintenanceGuard)
  const save = (patch: Partial<typeof g>) =>
    setSettings({ ...settings, maintenanceGuard: { ...g, ...patch } })

  const num = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    step = '1',
    hint?: string,
  ) => (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <label className="min-w-0 flex-1">
        <span className="block text-[16px] leading-6 text-text">{label}</span>
        {hint && <span className="block text-[14px] leading-5 text-fg-muted">{hint}</span>}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputCls} !w-[96px] text-right font-mono`}
      />
    </div>
  )

  return (
    <>
    <div className={sectionHead}>
      <h2 className={sectionTitle}>Ylläpidon vahti</h2>
    </div>
    <Card className="!p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] leading-6 text-text">Vahti päällä</span>
        <button
          role="switch"
          aria-checked={g.enabled}
          aria-label="Ylläpidon vahti"
          onClick={() => save({ enabled: !g.enabled })}
          className={`relative h-8 w-[52px] flex-none rounded-full p-0 transition-colors ${
            g.enabled
              ? 'bg-gradient-to-br from-[#e8b85a] to-[#a78bfa]'
              : 'border-2 border-[#899294] bg-[var(--surface-2)]'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left] duration-200 ${
              g.enabled ? 'left-[26px] bg-[#05060c]' : 'left-[4px] bg-[#899294]'
            }`}
          />
        </button>
      </div>
      <p className="m-0 mb-2 mt-1 text-[14px] leading-5 text-fg-muted">
        Vertaa viikkokeskiarvoa ankkuriin ja ehdottaa vajetta, jos paino on rajan yli kaksi
        kelvollista viikkoa peräkkäin, tai lisää jos se on alarajan alla. Ehdottaa aina, ei koskaan sovella itse.
      </p>

      {g.enabled && (
        <>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <label className="min-w-0 flex-1">
              <span className="block text-[16px] leading-6 text-text">Ankkuriviikko alkaa</span>
              <span className="block text-[14px] leading-5 text-fg-muted">
                ensimmäinen täysi maanantai–sunnuntai cutin jälkeen
              </span>
            </label>
            <input
              type="date"
              value={g.anchorWeekStart}
              onChange={(e) => save({ anchorWeekStart: e.target.value })}
              className={`${inputCls} !w-[150px]`}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-3">
            <label className="min-w-0 flex-1">
              <span className="block text-[16px] leading-6 text-text">Ankkuri (kg)</span>
              <span className="block text-[14px] leading-5 text-fg-muted">
                tyhjä = laske ankkuriviikon keskiarvosta
              </span>
            </label>
            <input
              type="number"
              step="0.1"
              value={g.anchorKg ?? ''}
              placeholder="auto"
              onChange={(e) => save({ anchorKg: e.target.value === '' ? null : Number(e.target.value) })}
              className={`${inputCls} !w-[96px] text-right font-mono`}
            />
          </div>

          {num('Punnituksia / viikko', g.minWeighInsPerWeek, (n) => save({ minWeighInsPerWeek: n }), '1',
            'alle tämän viikko ei laukaise eikä nollaa putkea')}
          {num('Raja ankkurin yli (kg)', g.triggerThresholdKg, (n) => save({ triggerThresholdKg: n }), '0.1')}
          {num('Raja ankkurin alle (kg)', g.lowerThresholdKg ?? 0.5, (n) => save({ lowerThresholdKg: n }), '0.1',
            'alle tämän yhtä monta viikkoa → ehdottaa syömään enemmän')}
          {num('Viikkoa peräkkäin', g.triggerConsecutiveWeeks, (n) => save({ triggerConsecutiveWeeks: n }), '1')}
          {num('Ehdotettava vaje (kcal/vrk)', g.suggestKcalPerDay, (n) => save({ suggestKcalPerDay: n }), '25')}
          {num('Rasvaosuus paluussa', g.fatFraction, (n) => save({ fatFraction: n }), '0.05',
            '1,0 antaa pisimmän arvion — liian lyhyt lupaus on pahempi')}
          {num('Paluun toleranssi (kg)', g.exitToleranceKg, (n) => save({ exitToleranceKg: n }), '0.1')}

          <div className="mt-3 flex flex-col gap-2">
            <span className="text-[16px] leading-6 text-text">Vajepäivät</span>
            <div className="flex flex-wrap gap-1">
              {([1, 2, 3, 4, 5, 6, 0] as number[]).map((d) => {
                const on = g.suggestDays.includes(d)
                return (
                  <button
                    key={d}
                    onClick={() => save({
                      suggestDays: on ? g.suggestDays.filter((x) => x !== d) : [...g.suggestDays, d].sort(),
                    })}
                    aria-pressed={on}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg text-[14px] font-medium ${
                      on ? 'bg-[rgba(232,184,90,0.2)] text-[#f5e6c4]' : 'border border-white/[0.18] text-text'
                    }`}
                  >
                    {DOW_NAMES[d].slice(0, 2)}
                  </button>
                )
              })}
            </div>
          </div>

          {(g.log?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-2.5">
              <div className="mb-1.5 text-[14px] font-medium text-text">
                Tapahtumat
              </div>
              {(g.log ?? []).slice(0, 5).map((e) => (
                <div key={e.at} className="mt-1 text-[14px] leading-5 text-fg-muted">
                  <span className="font-mono">{e.at.slice(0, 10)}</span> · {e.note}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
    </>
  )
}
