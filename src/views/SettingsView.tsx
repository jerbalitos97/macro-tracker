import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { Settings, ComputedResult, DayType, GoalPeriod, PeriodType } from '../types'
import { daysBetween, toISO } from '../lib/dates'
import { parsePositiveDecimal, parsePositiveInt, isValidDecimalInput } from '../lib/format'
import { getPeriods, addPeriod, endActivePeriod, removePeriod, updatePeriod } from '../lib/goalPeriods'
import { useAuth } from '../contexts/AuthContext'
import { GoalPeriodModal } from '../components/GoalPeriodModal'
import { s } from '../styles/tokens'

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
  const storageColor = usedPct > 80 ? '#e87a6a' : usedPct > 50 ? '#d4b85a' : '#6a9ad4'

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

  return (
    <div style={s.content}>
      <div style={s.dateHeader}>
        <div style={s.dateMain}>Asetukset</div>
      </div>

      {/* Tavoitehistoria — list of all goal periods + create/end actions */}
      <div style={{ ...s.card, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={s.cardLabel}>Tavoitehistoria</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{periods.length} jakso{periods.length === 1 ? '' : 'a'}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {periods.map((p) => {
            const isActive = p.status === 'active'
            const color = PERIOD_TYPE_COLOR[p.type]
            return (
              <div
                key={p.id}
                onClick={() => setPeriodModal({ mode: 'edit', initial: p })}
                role="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: isActive ? `${color}14` : 'rgba(255,255,255,0.03)',
                  border: isActive ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 28,
                    borderRadius: 2,
                    backgroundColor: color,
                    opacity: isActive ? 1 : 0.4,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span>{PERIOD_TYPE_LABEL[p.type]}</span>
                    <span style={{ color: '#888', fontWeight: 400 }}>
                      {p.startWeight.toFixed(1)} → {p.targetWeight.toFixed(1)} kg
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {p.startDate.slice(5).replace('-', '/')} – {p.endDate.slice(5).replace('-', '/')}
                    {p.label ? ` · ${p.label}` : ''}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: isActive ? color : '#666',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontFamily: "ui-monospace, 'SF Mono', monospace",
                  }}
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
                    style={{ ...s.iconBtn, color: '#3a3a3a' }}
                    aria-label="Poista jakso"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
          <button
            onClick={() => {
              if (!window.confirm('Päätetään nykyinen tavoite? Voit avata uuden jakson sen jälkeen.')) return
              setSettings(endActivePeriod(settings, todayISO, 'achieved'))
            }}
            style={s.actionBtn}
          >
            <CheckCircle2 size={13} />
            Päätä nykyinen
          </button>
          <button
            onClick={() => setPeriodModal({ mode: 'create' })}
            style={{ ...s.actionBtn, color: '#d4b85a' }}
          >
            <Plus size={13} />
            Aseta uusi
          </button>
        </div>
      </div>

      {/* Date range */}
      <div style={s.card}>
        <div style={s.cardLabel}>Cut-ajanjakso</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.inputLabel}>Alkaa</label>
            <input type="date" value={settings.startDate}
              onChange={(e) => update({ startDate: e.target.value })} style={s.input} />
          </div>
          <div>
            <label style={s.inputLabel}>Päättyy</label>
            <input type="date" value={settings.endDate}
              onChange={(e) => update({ endDate: e.target.value })} style={s.input} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{totalDays} päivää yhteensä</div>
      </div>

      {/* Weight */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Paino ja vaje</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.inputLabel}>Lähtöpaino (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              value={swText}
              onChange={(e) => {
                const v = e.target.value
                if (isValidDecimalInput(v) || v === '') setSwText(v)
              }}
              onBlur={commitStartWeight}
              style={s.input}
              placeholder="74,7"
            />
          </div>
          <div>
            <label style={s.inputLabel}>Tavoitepaino (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              value={twText}
              onChange={(e) => {
                const v = e.target.value
                if (isValidDecimalInput(v) || v === '') setTwText(v)
              }}
              onBlur={commitTargetWeight}
              style={s.input}
              placeholder="72,9"
            />
          </div>
        </div>
        <div style={{ marginTop: 12, padding: 10, backgroundColor: '#0a0a0a', borderRadius: 3, border: '1px solid #1f1f1f' }}>
          {[
            ['Pudotus', `${(settings.startWeight - settings.targetWeight).toFixed(1)} kg`],
            ['Kokonaisvaje', `${Math.round((settings.startWeight - settings.targetWeight) * 7700).toLocaleString('fi-FI')} kcal`],
            ['Päivävaje (perus)', `${Math.round(dailyDeficit)} kcal / pv`],
            ['Tempo', `${weeklyTempo} kg / vko`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span style={{ color: '#888' }}>{label}</span>
              <span style={{ color: label === 'Päivävaje (perus)' ? '#d4b85a' : '#e5e5e5', fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TDEE */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>TDEE per päivätyyppi</div>
        {(['rest', 'single', 'double', 'volleyball'] as const).map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <label style={{ fontSize: 12, color: '#888' }}>{TDEE_LABELS[key]}</label>
            <input
              type="text"
              inputMode="numeric"
              value={settings.tdee[key]}
              onChange={(e) => updateTdee(key, e.target.value)}
              style={{ ...s.input, width: 100, margin: 0 }}
            />
          </div>
        ))}
      </div>

      {/* Protein target */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Proteiinitavoite</div>
        <input
          type="text"
          inputMode="numeric"
          value={settings.proteinTarget}
          onChange={(e) => {
            const n = parsePositiveInt(e.target.value)
            if (n > 0) update({ proteinTarget: n })
          }}
          style={s.input}
        />
      </div>

      {/* Weekly pattern */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Viikkorytmi</div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
          Mitä päivätyyppiä kukin viikonpäivä oletusarvoisesti on
        </div>
        {([1, 2, 3, 4, 5, 6, 0] as number[]).map((dow) => (
          <div key={dow} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <label style={{ fontSize: 12, color: '#888' }}>{DOW_NAMES[dow]}</label>
            <select
              value={settings.weeklyPattern[dow]}
              onChange={(e) => updatePattern(dow, e.target.value as DayType)}
              style={{ ...s.input, width: 140, margin: 0, colorScheme: 'dark' }}
            >
              <option value="rest">Lepo</option>
              <option value="single">1 treeni</option>
              <option value="double">2 treeniä</option>
              <option value="volleyball">Volleyball</option>
            </select>
          </div>
        ))}
      </div>

      {/* Export / Import */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Varmuuskopio</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 4 }}>
            <span>Tallennustila käytössä</span>
            <span style={{ color: storageColor, fontVariantNumeric: 'tabular-nums' }}>
              {usedKB} KB / 5 000 KB
            </span>
          </div>
          <div style={{ ...s.progressBg, marginTop: 0 }}>
            <div style={{ ...s.progressFill, width: `${usedPct}%`, backgroundColor: storageColor }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onExport} style={s.secondaryBtn}>↓ Vie varmuuskopio (JSON)</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json"
            onChange={handleFileChange} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()}
            style={{ ...s.ghostBtn, width: '100%', textAlign: 'center' }}>
            ↑ Tuo varmuuskopio (JSON)
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 10, lineHeight: 1.5 }}>
          Tuonti korvaa kaiken nykyisen datan. Vie ensin varmuuskopio ennen tuontia.{'\n'}
          Data säilyy vaikka poistaisit pikakuvakkeen kotinäytöltä — se asuu Safarin
          sivustomuistissa. Poistaminen ei tyhjennä dataa.
        </div>
      </div>

      {/* Cloud account */}
      {authEnabled && (
        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>Pilvitili</div>
          {user ? (
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                Kirjautunut: <span style={{ color: '#d4b85a' }}>{user.email}</span>
              </div>
              <button
                onClick={() => signOut()}
                style={{ ...s.ghostBtn, width: '100%', textAlign: 'center', color: '#e87a6a' }}
              >
                Kirjaudu ulos
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#555' }}>Ei kirjautunut.</div>
          )}
        </div>
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
