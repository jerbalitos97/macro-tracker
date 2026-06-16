import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { Settings, ComputedResult, DayType, GoalPeriod, PeriodType } from '../types'
import { daysBetween, toISO } from '../lib/dates'
import { parsePositiveDecimal, parsePositiveInt, isValidDecimalInput } from '../lib/format'
import { getPeriods, addPeriod, endActivePeriod, removePeriod, updatePeriod } from '../lib/goalPeriods'
import { useAuth } from '../contexts/AuthContext'
import { GoalPeriodModal } from '../components/GoalPeriodModal'
import { Card, Button, Field } from '../components/ui'

const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  cut: 'Cut',
  maintenance: 'Maintenance',
  refill: 'Refill',
  bulk: 'Bulk',
}
const PERIOD_TYPE_COLOR: Record<PeriodType, string> = {
  cut: '#d4b85a',
  maintenance: '#6a9ad4',
  refill: '#c98ad4',
  bulk: '#8acb88',
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

  // Local string state only for decimal weight fields so the user can type
  // "74," without the comma being stripped mid-input.
  const [swText, setSwText] = useState(settings.startWeight.toFixed(1))
  const [twText, setTwText] = useState(settings.targetWeight.toFixed(1))

  // Sync display when settings change from outside (e.g. import)
  useEffect(() => { setSwText(settings.startWeight.toFixed(1)) }, [settings.startWeight])
  useEffect(() => { setTwText(settings.targetWeight.toFixed(1)) }, [settings.targetWeight])

  // When the legacy goal fields are edited, mirror the change into the
  // active period (if one exists) so the active jakso and legacy fields stay
  // in sync. Other fields (tdee, weeklyPattern, …) pass through unchanged.
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

  const commitStartWeight = () => {
    const n = parsePositiveDecimal(swText)
    if (!isNaN(n) && n > 0) {
      update({ startWeight: n })
      setSwText(n.toFixed(1))
    } else {
      setSwText(settings.startWeight.toFixed(1))
    }
  }

  const commitTargetWeight = () => {
    const n = parsePositiveDecimal(twText)
    if (!isNaN(n) && n > 0) {
      update({ targetWeight: n })
      setTwText(n.toFixed(1))
    } else {
      setTwText(settings.targetWeight.toFixed(1))
    }
  }

  const updateTdee = (key: string, raw: string) => {
    const n = parsePositiveInt(raw)
    if (n > 0) setSettings({ ...settings, tdee: { ...settings.tdee, [key]: n } })
  }

  const updatePattern = (dow: number, val: DayType) =>
    setSettings({ ...settings, weeklyPattern: { ...settings.weeklyPattern, [dow]: val } })

  const totalDays = daysBetween(settings.startDate, settings.endDate) + 1
  const dailyDeficit = computed.dailyDeficitBase
  const weeklyTempo = (((settings.startWeight - settings.targetWeight) / totalDays) * 7).toFixed(2)

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
  const inputLabelCls = 'mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

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
          <div className="text-[10px] text-white/30">
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
                    <span className="font-normal text-white/50">
                      {p.startWeight.toFixed(1)} → {p.targetWeight.toFixed(1)} kg
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-white/40">
                    {p.startDate.slice(5).replace('-', '/')} – {p.endDate.slice(5).replace('-', '/')}
                    {p.label ? ` · ${p.label}` : ''}
                  </div>
                </div>
                <div
                  className="font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={{ color: isActive ? color : '#666' }}
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
                    className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-[#3a3a3a]"
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

      {/* ── Cut-ajanjakso ────────────────────────────────────────────── */}
      <Card variant="glass">
        <div className={cardLabel}>Cut-ajanjakso</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className={inputLabelCls}>Alkaa</label>
            <input
              type="date"
              value={settings.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={inputLabelCls}>Päättyy</label>
            <input
              type="date"
              value={settings.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-1.5 text-[11px] text-muted">{totalDays} päivää yhteensä</div>
      </Card>

      {/* ── Paino ja vaje ────────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Paino ja vaje</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field
            label="Lähtöpaino (kg)"
            type="text"
            inputMode="decimal"
            value={swText}
            onChange={(e) => {
              const v = e.target.value
              if (isValidDecimalInput(v) || v === '') setSwText(v)
            }}
            onBlur={commitStartWeight}
            placeholder="74,7"
          />
          <Field
            label="Tavoitepaino (kg)"
            type="text"
            inputMode="decimal"
            value={twText}
            onChange={(e) => {
              const v = e.target.value
              if (isValidDecimalInput(v) || v === '') setTwText(v)
            }}
            onBlur={commitTargetWeight}
            placeholder="72,9"
          />
        </div>
        <div className="mt-1 rounded-[6px] border border-white/[0.07] bg-black/30 p-2.5">
          {[
            ['Pudotus', `${(settings.startWeight - settings.targetWeight).toFixed(1)} kg`, false],
            ['Kokonaisvaje', `${Math.round((settings.startWeight - settings.targetWeight) * 7700).toLocaleString('fi-FI')} kcal`, false],
            ['Päivävaje (perus)', `${Math.round(dailyDeficit)} kcal / pv`, true],
            ['Tempo', `${weeklyTempo} kg / vko`, false],
          ].map(([label, value, highlight]) => (
            <div key={label as string} className="mt-1 flex justify-between text-[12px]">
              <span className="text-muted">{label}</span>
              <span className={`tabular-nums font-semibold ${highlight ? 'text-accent' : 'text-text'}`}>{value}</span>
            </div>
          ))}
        </div>
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
          <div className="h-1.5 overflow-hidden rounded-sm bg-white/[0.06]">
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
        <div className="mt-2.5 text-[10px] leading-relaxed text-white/30">
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
            <div className="text-[12px] text-white/30">Ei kirjautunut.</div>
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
          defaultStartWeight={periodModal.mode === 'create' ? settings.startWeight : undefined}
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
