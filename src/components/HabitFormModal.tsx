import { useState } from 'react'
import type { Habit, HabitGoalPeriod, HabitGoalUnit } from '../types'
import { Sheet, Field, Button } from './ui'

const COLOR_SWATCHES = [
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#34d399', // green
  '#f87171', // red
  '#a78bfa', // purple
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

const fieldLabel = 'mb-1.5 block text-[12px] leading-4 text-fg-muted'
const seg = 'flex gap-1 rounded-3xl bg-[var(--surface-2)] p-1'
const segBtn = 'min-h-10 flex-1 cursor-pointer rounded-[20px] text-[14px] font-medium transition-colors'
const segOff = 'bg-transparent text-fg-muted'
const segOn = 'bg-cyan/[0.18] text-[#a5f3fc]'

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
    <Sheet
      open
      onClose={onClose}
      title={initial ? 'Muokkaa tapaa' : 'Uusi tapa'}
    >
      <Field
        label="Nimi"
        type="text"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="esim. Juo 2 l vettä"
        autoFocus
      />

      <Field
        label="Kuvaus (valinnainen)"
        type="text"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="esim. nesteytys"
      />

      <span className={fieldLabel}>Väri</span>
      <div className="mb-3 flex flex-wrap gap-2">
        {COLOR_SWATCHES.map((c) => {
          const active = form.color === c
          return (
            <button
              key={c}
              onClick={() => setForm({ ...form, color: c })}
              className="h-11 w-11 min-h-0 min-w-0 cursor-pointer rounded-full p-0"
              style={{ backgroundColor: c, border: active ? '3px solid #ffffff' : '3px solid transparent' }}
              aria-label={`Väri ${c}`}
              aria-pressed={active}
            />
          )
        })}
      </div>

      <span className={fieldLabel}>Jakso</span>
      <div className={`${seg} mb-3`}>
        {([
          ['day', 'Päivä'],
          ['week', 'Viikko'],
        ] as const).map(([id, label]) => {
          const active = form.goalPeriod === id
          return (
            <button
              key={id}
              aria-pressed={active}
              onClick={() =>
                setForm({
                  ...form,
                  goalPeriod: id,
                  goalValue: id === 'week' && form.goalValue < 2 ? 7 : form.goalValue,
                })
              }
              className={`${segBtn} ${active ? segOn : segOff}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <span className={fieldLabel}>Tyyppi</span>
      <div className={`${seg} mb-3`}>
        {([
          ['count', 'Määrä'],
          ['binary', 'Tehty'],
        ] as const).map(([id, label]) => {
          const active = form.goalUnit === id
          return (
            <button
              key={id}
              aria-pressed={active}
              onClick={() => setForm({ ...form, goalUnit: id })}
              className={`${segBtn} ${active ? segOn : segOff}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {form.goalUnit === 'count' && (
        <Field
          label={`Tavoite (${form.goalPeriod === 'week' ? 'kpl/vk' : 'kpl/pv'})`}
          type="number"
          min={1}
          value={form.goalValue}
          onChange={(e) => setForm({ ...form, goalValue: Math.max(1, Number(e.target.value)) })}
          inputMode="numeric"
        />
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 cursor-pointer rounded-full px-3 text-[14px] font-semibold text-accent"
        >
          Peru
        </button>
        <Button variant="primary" onClick={handleSave} disabled={!valid} className="flex-none">
          Tallenna
        </Button>
      </div>
    </Sheet>
  )
}
