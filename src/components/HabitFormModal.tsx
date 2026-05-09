import { useState } from 'react'
import { ListChecks } from 'lucide-react'
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

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} className="modal-enter" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.15)',
            margin: '-8px auto 20px',
          }}
        />

        <div style={s.modalTitle}>
          <ListChecks size={14} />
          {initial ? 'Muokkaa tapaa' : 'Uusi tapa'}
        </div>

        <label style={s.inputLabel}>Nimi</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={s.input}
          placeholder="esim. Juo 2 l vettä"
          autoFocus
        />

        <label style={s.inputLabel}>Kuvaus (valinnainen)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={s.input}
          placeholder="esim. terveellisempi nesteytys"
        />

        <label style={s.inputLabel}>Väri</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {COLOR_SWATCHES.map((c) => {
            const active = form.color === c
            return (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
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

        <label style={s.inputLabel}>Tavoite­jakso</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6, marginBottom: 12 }}>
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
                style={{ ...s.toggleBtn, ...(active ? s.toggleBtnActive : {}) }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <label style={s.inputLabel}>Tavoitetyyppi</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6, marginBottom: 12 }}>
          {([
            ['count', 'Lukumäärä'],
            ['binary', 'Tehty / ei'],
          ] as const).map(([id, label]) => {
            const active = form.goalUnit === id
            return (
              <button
                key={id}
                onClick={() => setForm({ ...form, goalUnit: id })}
                style={{ ...s.toggleBtn, ...(active ? s.toggleBtnActive : {}) }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {form.goalUnit === 'count' && (
          <>
            <label style={s.inputLabel}>Tavoitearvo ({form.goalPeriod === 'week' ? 'kpl/viikko' : 'kpl/päivä'})</label>
            <input
              type="number"
              min={1}
              value={form.goalValue}
              onChange={(e) => setForm({ ...form, goalValue: Math.max(1, Number(e.target.value)) })}
              style={s.input}
              inputMode="numeric"
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
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
    </div>
  )
}
