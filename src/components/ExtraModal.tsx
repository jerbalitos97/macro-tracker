import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import type { ExtraWorkout } from '../types'
import { Sheet, Field, Button } from './ui'

type FormState = Omit<ExtraWorkout, 'id'>

interface Props {
  defaultDate: string
  onSave: (ex: FormState) => void
  onClose: () => void
}

export function ExtraModal({ defaultDate, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>({
    date: defaultDate,
    kcal: 300,
    note: '',
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title={<><Dumbbell size={14} />Ekstratreeni / kävely</>}
    >
      <Field
        label="Päivä"
        type="date"
        value={form.date}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
      />

      <Field
        label="Kulutus (kcal)"
        type="number"
        value={form.kcal}
        onChange={(e) => setForm({ ...form, kcal: Number(e.target.value) })}
        autoFocus
      />

      <Field
        label="Muistiinpano (valinnainen)"
        type="text"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="esim. työmatkan kävely"
      />

      <div className="mt-[18px] flex gap-2">
        <Button variant="primary" onClick={() => onSave(form)}>
          Tallenna
        </Button>
        <Button variant="ghost" onClick={onClose}>Peru</Button>
      </div>
    </Sheet>
  )
}
