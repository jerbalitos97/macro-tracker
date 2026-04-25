import { useState } from 'react'
import type { Settings, ComputedResult, DayType } from '../types'
import { daysBetween } from '../lib/dates'
import { s } from '../styles/tokens'

interface Props {
  settings: Settings
  setSettings: (s: Settings) => void
  computed: ComputedResult
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

export function SettingsView({ settings, setSettings, computed }: Props) {
  const [local, setLocal] = useState<Settings>(settings)

  const update = (patch: Partial<Settings>) => {
    const next = { ...local, ...patch }
    setLocal(next)
    setSettings(next)
  }

  const updateTdee = (key: string, val: string) => {
    const next: Settings = { ...local, tdee: { ...local.tdee, [key]: Number(val) } }
    setLocal(next)
    setSettings(next)
  }

  const totalDays = daysBetween(local.startDate, local.endDate) + 1
  const dailyDeficit = computed.dailyDeficitBase
  const weeklyTempo = (((local.startWeight - local.targetWeight) / totalDays) * 7).toFixed(2)

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
              value={local.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Päättyy</label>
            <input
              type="date"
              value={local.endDate}
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
              value={local.startWeight}
              onChange={(e) => update({ startWeight: Number(e.target.value) })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Tavoitepaino (kg)</label>
            <input
              type="number"
              step="0.1"
              value={local.targetWeight}
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
            ['Pudotus', `${(local.startWeight - local.targetWeight).toFixed(1)} kg`],
            [
              'Kokonaisvaje',
              `${Math.round((local.startWeight - local.targetWeight) * 7700).toLocaleString('fi-FI')} kcal`,
            ],
            ['Päivävaje (perus)', `${Math.round(dailyDeficit)} kcal / pv`],
            ['Tempo', `${weeklyTempo} kg / vko`],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}
            >
              <span style={{ color: '#888' }}>{label}</span>
              <span style={{ color: label === 'Päivävaje (perus)' ? '#d4b85a' : '#e5e5e5', fontWeight: 600 }}>
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
              value={local.tdee[key]}
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
          value={local.proteinTarget}
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
              value={local.weeklyPattern[dow]}
              onChange={(e) => {
                const next: Settings = {
                  ...local,
                  weeklyPattern: {
                    ...local.weeklyPattern,
                    [dow]: e.target.value as DayType,
                  },
                }
                setLocal(next)
                setSettings(next)
              }}
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
    </div>
  )
}
