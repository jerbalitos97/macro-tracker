import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Card, Button, Field } from './ui'
import { parsePositiveInt, parsePositiveDecimal, isValidDecimalInput } from '../lib/format'

// Aterian kirjaus käsin. Yhteinen Tänään-näkymälle ja kirjaustilalle, jotta
// sama lomake ei elä kahtena kopiona.

export function AddMealForm({
  onAdd, onOpen,
}: {
  onAdd: (meal: { kcal: number; protein: number }) => void
  /** Kutsutaan kun lomake avataan — Tänään-näkymä sulkee silloin kulutuslomakkeen. */
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ kcal: '', protein: '' })

  const submit = (keepOpen: boolean) => {
    const kcal = parsePositiveInt(form.kcal)
    const protein = parsePositiveDecimal(form.protein)
    if (!kcal || kcal <= 0) return
    onAdd({ kcal, protein })
    setForm({ kcal: '', protein: '' })
    if (!keepOpen) setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); onOpen?.() }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/[0.12] bg-transparent px-4 py-[13px] text-[13px] tracking-[0.02em] text-fg-faint"
      >
        <Plus size={14} />Lisää ateria
      </button>
    )
  }

  return (
    <Card className="card-enter mt-3 border-accent/15">
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label="kcal"
          type="text"
          inputMode="numeric"
          value={form.kcal}
          onChange={(e) => {
            const v = e.target.value
            if (/^\d*$/.test(v)) setForm({ ...form, kcal: v })
          }}
          autoFocus
          placeholder="500"
        />
        <Field
          label="proteiini (g)"
          type="text"
          inputMode="decimal"
          value={form.protein}
          onChange={(e) => {
            const v = e.target.value
            if (isValidDecimalInput(v) || v === '') setForm({ ...form, protein: v })
          }}
          placeholder="30"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={() => submit(false)}>Lisää</Button>
        <Button variant="secondary" onClick={() => submit(true)}>+ Uusi</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Peru</Button>
      </div>
    </Card>
  )
}
