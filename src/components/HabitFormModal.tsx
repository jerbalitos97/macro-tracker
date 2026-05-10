import { useState } from 'react'
import { ChevronLeft, ListChecks } from 'lucide-react'
import type { Habit, HabitGoalPeriod, HabitGoalUnit } from '../types'
import { s } from '../styles/tokens'

const COLOR_SWATCHES = [
  '#d4b85a', // gold
  '#6a9ad4', // blue
  '#8acb88', // green
  '#e87a6a', // red
  '#c98ad4', // purple
  '#d49a6a', // orange
  '#6ad4c8', // teal
  '#aaaaaa', // grey
]

type FormState = {
  name: string
  description: string
  color: string
  goalPeriod: HabitGoalPeriod
  goalValue: number
  goalUnit: HabitGoalUnit
}

interface Props {
  initial?: Habit
  onSave: (input: FormState) => void
  onClose: () => void
}

export function HabitFormModal({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color ?? COLOR_SWATCHES[0],
    goalPeriod: initial?.goalPeriod ?? 'day',
    goalValue: initial?.goalValue ?? 1,
    goalUnit: initial?.goalUnit ?? 'count',
  })

  const trimmed = form.name.trim()
  const valid = trimmed.length > 0 && (form.goalUnit === 'binary' || form.goalValue >= 1)

  const handleSave = () => {
    if (!valid) return
    onSave({
      ...form,
      name: trimmed,
      goalValue: form.goalUnit === 'binary' ? 1 : form.goalValue,
    })
  }

  // Compact field styles so the whole form fits in the bottom sheet
  // without internal scrolling on iPhone-sized screens.
  const compactInput: React.CSSProperties = { ...s.input, padding: '10px 12px', fontSize: 14, marginTop: 4, marginBottom: 6 }
  const compactLabel: React.CSSProperties = { ...s.inputLabel, marginTop: 2 }
  const compactToggle: React.CSSProperties = { ...s.toggleBtn, padding: '7px 4px' }

  return (
    <div style={s.content}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onClose} style={{ ...s.iconBtn, color: '#fff' }} aria-label="Takaisin">
          <ChevronLeft size={22} />
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: '#d4b85a',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          <ListChecks size={14} />
          {initial ? 'Muokkaa tapaa' : 'Uusi tapa'}
        </div>
      </div>

        <label style={compactLabel}>Nimi</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={compactInput}
          placeholder="esim. Juo 2 l vettä"
          autoFocus
        />

        <label style={compactLabel}>Kuvaus (valinnainen)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={compactInput}
          placeholder="esim. nesteytys"
        />

        <label style={compactLabel}>Väri</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 8,
            marginTop: 4,
            marginBottom: 10,
          }}
        >
          {COLOR_SWATCHES.map((c) => {
            const active = form.color === c
            return (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  backgroundColor: c,
                  border: active ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  minWidth: 0,
                  minHeight: 0,
                }}
                aria-label={`Väri ${c}`}
              />
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={compactLabel}>Jakso</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
              {([
                ['day', 'Päivä'],
                ['week', 'Viikko'],
              ] as const).map(([id, label]) => {
                const active = form.goalPeriod === id
                return (
                  <button
                    key={id}
                    onClick={() =>
                      setForm({
                        ...form,
                        goalPeriod: id,
                        goalValue: id === 'week' && form.goalValue < 2 ? 7 : form.goalValue,
                      })
                    }
                    style={{ ...compactToggle, ...(active ? s.toggleBtnActive : {}) }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label style={compactLabel}>Tyyppi</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
              {([
                ['count', 'Määrä'],
                ['binary', 'Tehty'],
              ] as const).map(([id, label]) => {
                const active = form.goalUnit === id
                return (
                  <button
                    key={id}
                    onClick={() => setForm({ ...form, goalUnit: id })}
                    style={{ ...compactToggle, ...(active ? s.toggleBtnActive : {}) }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {form.goalUnit === 'count' && (
          <div style={{ marginTop: 10 }}>
            <label style={compactLabel}>Tavoite ({form.goalPeriod === 'week' ? 'kpl/vk' : 'kpl/pv'})</label>
            <input
              type="number"
              min={1}
              value={form.goalValue}
              onChange={(e) => setForm({ ...form, goalValue: Math.max(1, Number(e.target.value)) })}
              style={compactInput}
              inputMode="numeric"
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={handleSave}
            disabled={!valid}
            style={{ ...s.primaryBtn, opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'not-allowed' }}
          >
            Tallenna
          </button>
          <button onClick={onClose} style={s.ghostBtn}>
            Peru
          </button>
        </div>
    </div>
  )
}
