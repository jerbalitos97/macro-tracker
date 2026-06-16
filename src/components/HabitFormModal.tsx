import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import type { Habit, HabitGoalPeriod, HabitGoalUnit } from '../types'
import { Sheet, Field, Button } from './ui'

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

const fieldLabel = 'mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const toggleBase = 'rounded-input border px-1 py-[7px] text-center text-[11px] font-mono cursor-pointer transition-colors'
const toggleOff = 'border-white/[0.08] bg-black/30 text-muted'
const toggleOn = 'border-accent/35 bg-accent/[0.1] text-accent'

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
      title={
        <>
          <ListChecks size={14} />
          {initial ? 'Muokkaa tapaa' : 'Uusi tapa'}
        </>
      }
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

      <label className={fieldLabel}>Väri</label>
      <div className="mb-2.5 mt-1 grid grid-cols-8 gap-2">
        {COLOR_SWATCHES.map((c) => {
          const active = form.color === c
          return (
            <button
              key={c}
              onClick={() => setForm({ ...form, color: c })}
              className={`aspect-square min-h-0 min-w-0 w-full rounded-full p-0 ${active ? 'border-2 border-white' : 'border-2 border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`Väri ${c}`}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={fieldLabel}>Jakso</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
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
                  className={`${toggleBase} ${active ? toggleOn : toggleOff}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className={fieldLabel}>Tyyppi</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {([
              ['count', 'Määrä'],
              ['binary', 'Tehty'],
            ] as const).map(([id, label]) => {
              const active = form.goalUnit === id
              return (
                <button
                  key={id}
                  onClick={() => setForm({ ...form, goalUnit: id })}
                  className={`${toggleBase} ${active ? toggleOn : toggleOff}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {form.goalUnit === 'count' && (
        <div className="mt-2.5">
          <Field
            label={`Tavoite (${form.goalPeriod === 'week' ? 'kpl/vk' : 'kpl/pv'})`}
            type="number"
            min={1}
            value={form.goalValue}
            onChange={(e) => setForm({ ...form, goalValue: Math.max(1, Number(e.target.value)) })}
            inputMode="numeric"
          />
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" onClick={handleSave} disabled={!valid}>
          Tallenna
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Peru
        </Button>
      </div>
    </Sheet>
  )
}
