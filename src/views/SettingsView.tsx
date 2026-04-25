import { useRef } from 'react'
import type { Settings, ComputedResult, DayType } from '../types'
import { daysBetween } from '../lib/dates'
import { s } from '../styles/tokens'

interface Props {
  settings: Settings
  setSettings: (s: Settings) => void
  computed: ComputedResult
  usedBytes: number
  onExport: () => void
  onImport: (json: string) => void
}

const TDEE_LABELS: Record<string, string> = {
  rest: 'Lepo',
  single: '1 treeni',
  double: '2 treeniä',
  volleyball: 'Volleyball',
}

const DOW_NAMES: Record<number, string> = {
  1: 'Maanantai',
  2: 'Tiistai',
  3: 'Keskiviikko',
  4: 'Torstai',
  5: 'Perjantai',
  6: 'Lauantai',
  0: 'Sunnuntai',
}

// 5 MB iOS Safari soft limit
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024

export function SettingsView({ settings, setSettings, computed, usedBytes, onExport, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Read directly from settings prop — no local copy that can diverge
  const update = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch })
  }

  const updateTdee = (key: string, val: string) => {
    setSettings({ ...settings, tdee: { ...settings.tdee, [key]: Number(val) } })
  }

  const updatePattern = (dow: number, val: DayType) => {
    setSettings({ ...settings, weeklyPattern: { ...settings.weeklyPattern, [dow]: val } })
  }

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
    // Reset so same file can be re-imported
    e.target.value = ''
  }

  return (
    <div style={s.content}>
      <div style={s.dateHeader}>
        <div style={s.dateMain}>Asetukset</div>
      </div>

      {/* Date range */}
      <div style={s.card}>
        <div style={s.cardLabel}>Cut-ajanjakso</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.inputLabel}>Alkaa</label>
            <input
              type="date"
              value={settings.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Päättyy</label>
            <input
              type="date"
              value={settings.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
              style={s.input}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
          {totalDays} päivää yhteensä
        </div>
      </div>

      {/* Weight */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Paino ja vaje</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.inputLabel}>Lähtöpaino (kg)</label>
            <input
              type="number"
              step="0.1"
              value={settings.startWeight}
              onChange={(e) => update({ startWeight: Number(e.target.value) })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Tavoitepaino (kg)</label>
            <input
              type="number"
              step="0.1"
              value={settings.targetWeight}
              onChange={(e) => update({ targetWeight: Number(e.target.value) })}
              style={s.input}
            />
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 10,
            backgroundColor: '#0a0a0a',
            borderRadius: 3,
            border: '1px solid #1f1f1f',
          }}
        >
          {[
            ['Pudotus', `${(settings.startWeight - settings.targetWeight).toFixed(1)} kg`],
            [
              'Kokonaisvaje',
              `${Math.round((settings.startWeight - settings.targetWeight) * 7700).toLocaleString('fi-FI')} kcal`,
            ],
            ['Päivävaje (perus)', `${Math.round(dailyDeficit)} kcal / pv`],
            ['Tempo', `${weeklyTempo} kg / vko`],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}
            >
              <span style={{ color: '#888' }}>{label}</span>
              <span
                style={{
                  color: label === 'Päivävaje (perus)' ? '#d4b85a' : '#e5e5e5',
                  fontWeight: 600,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* TDEE */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>TDEE per päivätyyppi</div>
        {(['rest', 'single', 'double', 'volleyball'] as const).map((key) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
            }}
          >
            <label style={{ fontSize: 12, color: '#888' }}>{TDEE_LABELS[key]}</label>
            <input
              type="number"
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
          type="number"
          value={settings.proteinTarget}
          onChange={(e) => update({ proteinTarget: Number(e.target.value) })}
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
          <div
            key={dow}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
            }}
          >
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

      {/* ── Export / Import ── */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Varmuuskopio</div>

        {/* Storage usage bar */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#666',
              marginBottom: 4,
            }}
          >
            <span>Tallennustila käytössä</span>
            <span style={{ color: storageColor, fontVariantNumeric: 'tabular-nums' }}>
              {usedKB} KB / 5 000 KB
            </span>
          </div>
          <div style={{ ...s.progressBg, marginTop: 0 }}>
            <div
              style={{
                ...s.progressFill,
                width: `${usedPct}%`,
                backgroundColor: storageColor,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Export */}
          <button onClick={onExport} style={s.secondaryBtn}>
            ↓ Vie varmuuskopio (JSON)
          </button>

          {/* Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ ...s.ghostBtn, width: '100%', textAlign: 'center' }}
          >
            ↑ Tuo varmuuskopio (JSON)
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#555', marginTop: 10, lineHeight: 1.5 }}>
          Tuonti korvaa kaiken nykyisen datan. Vie ensin varmuuskopio ennen tuontia.{'\n'}
          iOS: tallennustila tyhjenee jos poistat sovelluksen kotinäytöltä.
        </div>
      </div>
    </div>
  )
}
