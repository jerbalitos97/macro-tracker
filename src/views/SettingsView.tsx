import { useState, useRef } from 'react'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { Settings, ComputedResult, DayType, GoalPeriod, PeriodType } from '../types'
import { toISO } from '../lib/dates'
import { parsePositiveInt } from '../lib/format'
import { getPeriods, getActivePeriod, getActiveGoal, addPeriod, endActivePeriod, removePeriod, updatePeriod } from '../lib/goalPeriods'
import { useAuth } from '../contexts/AuthContext'
import { GoalPeriodModal } from '../components/GoalPeriodModal'
import { Card, Button } from '../components/ui'

const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  cut: 'Cut',
  maintenance: 'Maintenance',
  refill: 'Refill',
  bulk: 'Bulk',
}
const PERIOD_TYPE_COLOR: Record<PeriodType, string> = {
  cut: '#22d3ee',
  maintenance: '#60a5fa',
  refill: '#a78bfa',
  bulk: '#34d399',
}

interface Props {
  settings: Settings
  setSettings: (s: Settings) => void
  computed: ComputedResult
  usedBytes: number
  onExport: () => void
  onImport: (json: string) => void
  user?: User | null
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

const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

export function SettingsView({ settings, setSettings, computed, usedBytes, onExport, onImport, user }: Props) {
  const { signOut, enabled: authEnabled } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [periodModal, setPeriodModal] = useState<
    | { mode: 'create'; initial?: undefined }
    | { mode: 'edit'; initial: GoalPeriod }
    | null
  >(null)

  const periods = getPeriods(settings)
  const todayISO = toISO(new Date())

  // When a goal field is edited, mirror the change into the active period (if
  // one exists) so the active jakso and legacy fields stay in sync. Other
  // fields (tdee, weeklyPattern, …) pass through unchanged.
  const update = (patch: Partial<Settings>) => {
    let next: Settings = { ...settings, ...patch }
    const goalFields: (keyof Settings)[] = ['startDate', 'endDate', 'startWeight', 'targetWeight']
    const touchedGoal = goalFields.some((k) => k in patch)
    if (touchedGoal && (next.goalPeriods?.length ?? 0) > 0) {
      const activeIdx = next.goalPeriods!.findIndex((p) => p.status === 'active')
      if (activeIdx >= 0) {
        const periodPatch: Partial<GoalPeriod> = {}
        if ('startDate' in patch) periodPatch.startDate = patch.startDate
        if ('endDate' in patch) periodPatch.endDate = patch.endDate
        if ('startWeight' in patch) periodPatch.startWeight = patch.startWeight
        if ('targetWeight' in patch) periodPatch.targetWeight = patch.targetWeight
        const updated = next.goalPeriods!.map((p, i) =>
          i === activeIdx ? { ...p, ...periodPatch } : p,
        )
        next = { ...next, goalPeriods: updated }
      }
    }
    setSettings(next)
  }

  const updateTdee = (key: string, raw: string) => {
    const n = parsePositiveInt(raw)
    if (n > 0) setSettings({ ...settings, tdee: { ...settings.tdee, [key]: n } })
  }

  const updatePattern = (dow: number, val: DayType) =>
    setSettings({ ...settings, weeklyPattern: { ...settings.weeklyPattern, [dow]: val } })

  // Everything the summary card shows comes from the goal in force, not from
  // the frozen legacy settings fields.
  const activePeriod = getActivePeriod(settings, todayISO)
  const goal = getActiveGoal(settings, todayISO)
  const plansDeficit = goal.type === 'cut' || goal.type === 'bulk'
  // With weekendMaintenance the plan is not flat: weekdays carry the whole
  // deficit. computed.days already holds the per-day figure, so read the
  // weekday rate off it rather than recomputing the split here.
  const weekdayDeficit = goal.weekendMaintenance
    ? Math.max(0, ...computed.days.map((d) => d.dailyDeficitBase))
    : 0

  const usedKB = (usedBytes / 1024).toFixed(1)
  const usedPct = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100)
  const storageColorClass = usedPct > 80 ? 'bg-danger' : usedPct > 50 ? 'bg-accent' : 'bg-protein'
  const storageTextClass  = usedPct > 80 ? 'text-danger' : usedPct > 50 ? 'text-accent' : 'text-protein'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text === 'string') onImport(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Shared input class for raw <input> / <select> elements that aren't
  // wrapped by the Field primitive.
  const inputCls = 'w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[11px] text-sm text-text [color-scheme:dark]'

  return (
    <div className="px-4 pb-2 pt-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="font-display text-[22px] font-bold tracking-[-0.025em] text-text">Asetukset</div>
      </div>

      {/* ── Tavoitehistoria ─────────────────────────────────────────── */}
      <Card variant="glass" className="mb-2.5">
        <div className="flex items-baseline justify-between">
          <div className={cardLabel}>Tavoitehistoria</div>
          <div className="text-[10px] text-fg-ghost">
            {periods.length} jakso{periods.length === 1 ? '' : 'a'}
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          {periods.map((p) => {
            const isActive = p.status === 'active'
            const color = PERIOD_TYPE_COLOR[p.type]
            return (
              <div
                key={p.id}
                onClick={() => setPeriodModal({ mode: 'edit', initial: p })}
                role="button"
                className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2.5"
                style={{
                  backgroundColor: isActive ? `${color}14` : 'rgba(255,255,255,0.03)',
                  borderColor: isActive ? `${color}55` : 'rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="h-7 w-1 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: color, opacity: isActive ? 1 : 0.4 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 text-[12px] font-semibold text-text">
                    <span>{PERIOD_TYPE_LABEL[p.type]}</span>
                    <span className="font-normal text-fg-muted">
                      {p.startWeight.toFixed(1)} → {p.targetWeight.toFixed(1)} kg
                    </span>
                  </div>
                  {/* A long label used to wrap to three lines and crowd the status
                      column beside it. The dates stay on one line and the label
                      gets its own, each truncated rather than wrapped. */}
                  <div className="mt-0.5 truncate text-[10px] text-fg-faint">
                    {p.startDate.slice(5).replace('-', '/')} – {p.endDate.slice(5).replace('-', '/')}
                  </div>
                  {p.label && (
                    <div className="mt-0.5 truncate text-[10px] text-fg-ghost">{p.label}</div>
                  )}
                </div>
                <div
                  className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-fg-faint"
                  style={{ color: isActive ? color : undefined }}
                >
                  {p.status === 'active' ? 'Aktiivinen' : p.status === 'achieved' ? 'Saavutettu' : 'Päätetty'}
                </div>
                {!isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm('Poistetaanko tämä tavoitejakso historiasta?')) {
                        setSettings(removePeriod(settings, p.id))
                      }
                    }}
                    className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-fg-ghost"
                    aria-label="Poista jakso"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button
            variant="action"
            onClick={() => {
              if (!window.confirm('Päätetään nykyinen tavoite? Voit avata uuden jakson sen jälkeen.')) return
              setSettings(endActivePeriod(settings, todayISO, 'achieved'))
            }}
          >
            <CheckCircle2 size={13} />
            Päätä nykyinen
          </Button>
          <Button
            variant="action"
            className="text-accent"
            onClick={() => setPeriodModal({ mode: 'create' })}
          >
            <Plus size={13} />
            Aseta uusi
          </Button>
        </div>
      </Card>

      {/* ── Voimassa oleva tavoite ───────────────────────────────────
          Read-only on purpose. This used to be two editors ("Cut-ajanjakso",
          "Paino ja vaje") writing to the legacy settings fields — a second
          way to edit a goal that could not set the period type or the weekend
          rule, and that showed the *first* goal's numbers while the rest of
          the app had moved on to the active period. Tapping the period in
          Tavoitehistoria above is the one editor now; this card just states
          what is in force. */}
      <Card variant="glass">
        <div className="flex items-baseline justify-between">
          <div className={cardLabel}>Voimassa oleva tavoite</div>
          <button
            onClick={() => activePeriod && setPeriodModal({ mode: 'edit', initial: activePeriod })}
            disabled={!activePeriod}
            className="text-[11px] text-accent disabled:opacity-40"
          >
            Muokkaa
          </button>
        </div>
        <div className="text-[12px] font-semibold text-text">
          {PERIOD_TYPE_LABEL[goal.type]} · {goal.startWeight.toFixed(1)} → {goal.targetWeight.toFixed(1)} kg
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {goal.startDate.slice(5).replace('-', '/')} – {goal.endDate.slice(5).replace('-', '/')} · {goal.totalDays} päivää · päivä {goal.elapsedDays}
        </div>
        <div className="mt-2 rounded-[6px] border border-white/[0.07] bg-black/30 p-2.5">
          {([
            ['Muutos', `${goal.kgToChange.toFixed(1)} kg`, false],
            ...(plansDeficit
              ? ([
                  ['Kokonaisvaje', `${Math.round(goal.totalDeficitKcal).toLocaleString('fi-FI')} kcal`, false],
                  goal.weekendMaintenance
                    ? ['Päivävaje (arki)', `${Math.round(weekdayDeficit)} kcal / pv`, true]
                    : ['Päivävaje (perus)', `${Math.round(goal.dailyDeficitKcal)} kcal / pv`, true],
                ] as Array<[string, string, boolean]>)
              : ([['Vaje', 'ei vajetta — ylläpito', false]] as Array<[string, string, boolean]>)),
            ['Tempo', `${goal.weeklyRateKg.toFixed(2)} kg / vko`, false],
          ] as Array<[string, string, boolean]>).map(([label, value, highlight]) => (
            <div key={label} className="mt-1 flex justify-between text-[12px]">
              <span className="text-muted">{label}</span>
              <span className={`tabular-nums font-semibold ${highlight ? 'text-accent' : 'text-text'}`}>{value}</span>
            </div>
          ))}
        </div>
        {goal.weekendMaintenance && (
          <div className="mt-1.5 text-[11px] text-fg-faint">
            Viikonloput ylläpidolla — koko vaje on jalkautettu arkipäiville.
          </div>
        )}
      </Card>

      {/* ── TDEE per päivätyyppi ─────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>TDEE per päivätyyppi</div>
        {(['rest', 'single', 'double', 'volleyball'] as const).map((key) => (
          <div key={key} className="mt-2 flex items-center justify-between gap-3">
            <label className="text-[12px] text-muted">{TDEE_LABELS[key]}</label>
            <input
              type="text"
              inputMode="numeric"
              value={settings.tdee[key]}
              onChange={(e) => updateTdee(key, e.target.value)}
              className={`${inputCls} w-[100px]`}
              style={{ marginTop: 0, marginBottom: 0 }}
            />
          </div>
        ))}
      </Card>

      {/* ── Proteiinitavoite ─────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Proteiinitavoite</div>
        <input
          type="text"
          inputMode="numeric"
          value={settings.proteinTarget}
          onChange={(e) => {
            const n = parsePositiveInt(e.target.value)
            if (n > 0) update({ proteinTarget: n })
          }}
          className={inputCls}
        />
      </Card>

      {/* ── Viikkorytmi ─────────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Viikkorytmi</div>
        <div className="mb-2 text-[11px] text-muted">
          Mitä päivätyyppiä kukin viikonpäivä oletusarvoisesti on
        </div>
        {([1, 2, 3, 4, 5, 6, 0] as number[]).map((dow) => (
          <div key={dow} className="mt-1.5 flex items-center justify-between gap-3">
            <label className="text-[12px] text-muted">{DOW_NAMES[dow]}</label>
            <select
              value={settings.weeklyPattern[dow]}
              onChange={(e) => updatePattern(dow, e.target.value as DayType)}
              className={`${inputCls} w-[140px] [color-scheme:dark]`}
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              <option value="rest">Lepo</option>
              <option value="single">1 treeni</option>
              <option value="double">2 treeniä</option>
              <option value="volleyball">Volleyball</option>
            </select>
          </div>
        ))}
      </Card>

      {/* ── Varmuuskopio ─────────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Varmuuskopio</div>
        <div className="mb-3.5">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="text-muted">Tallennustila käytössä</span>
            <span className={`tabular-nums ${storageTextClass}`}>{usedKB} KB / 5 000 KB</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-[rgba(9,11,20,0.50)]">
            <div
              className={`h-full rounded-sm transition-[width] duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${storageColorClass}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={onExport}>↓ Vie varmuuskopio (JSON)</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button variant="ghost" className="w-full" onClick={() => fileInputRef.current?.click()}>
            ↑ Tuo varmuuskopio (JSON)
          </Button>
        </div>
        <div className="mt-2.5 text-[10px] leading-relaxed text-fg-ghost">
          Tuonti korvaa kaiken nykyisen datan. Vie ensin varmuuskopio ennen tuontia.{'\n'}
          Data säilyy vaikka poistaisit pikakuvakkeen kotinäytöltä — se asuu Safarin
          sivustomuistissa. Poistaminen ei tyhjennä dataa.
        </div>
      </Card>

      {/* ── Pilvitili ───────────────────────────────────────────────── */}
      {authEnabled && (
        <Card variant="glass" className="mt-2.5">
          <div className={cardLabel}>Pilvitili</div>
          {user ? (
            <div>
              <div className="mb-3 text-[12px] text-muted">
                Kirjautunut: <span className="text-accent">{user.email}</span>
              </div>
              <Button variant="ghost" className="w-full text-danger" onClick={() => signOut()}>
                Kirjaudu ulos
              </Button>
            </div>
          ) : (
            <div className="text-[12px] text-fg-ghost">Ei kirjautunut.</div>
          )}
        </Card>
      )}

      {periodModal && (
        <GoalPeriodModal
          initial={periodModal.mode === 'edit' ? periodModal.initial : undefined}
          defaultStartDate={
            periodModal.mode === 'create'
              ? // start the next jakso from the most recent end (or today)
                periods.length > 0
                ? periods.reduce((a, b) => (a.endDate >= b.endDate ? a : b)).endDate
                : todayISO
              : undefined
          }
          defaultStartWeight={periodModal.mode === 'create' ? goal.targetWeight : undefined}
          onSave={(p) => {
            if (periodModal.mode === 'edit') {
              setSettings(updatePeriod(settings, periodModal.initial.id, p))
            } else {
              setSettings(addPeriod(settings, p))
            }
            setPeriodModal(null)
          }}
          onClose={() => setPeriodModal(null)}
        />
      )}
    </div>
  )
}
