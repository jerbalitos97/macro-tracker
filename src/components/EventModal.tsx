import { useState, useEffect } from 'react'
import { PartyPopper } from 'lucide-react'
import type { SpecialEvent, BufferDirection } from '../types'
import { toISO } from '../lib/dates'
import { Sheet, Field, Chip, Button } from './ui'

type FormState = Omit<SpecialEvent, 'id'>

interface Props {
  defaultDate: string
  onSave: (ev: FormState) => void
  onClose: () => void
}

const fieldLabel = 'mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const selectClass =
  'mb-2 mt-1.5 w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[11px] text-sm text-text [color-scheme:dark]'

export function EventModal({ defaultDate, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>({
    date: defaultDate,
    name: '',
    excessKcal: 800,
    bufferDays: 3,
    bufferDirection: 'before',
  })

  const todayISO = toISO(new Date())
  const isPastOrToday = form.date <= todayISO

  useEffect(() => {
    if (isPastOrToday && form.bufferDirection === 'before') {
      setForm((f) => ({ ...f, bufferDirection: 'after' }))
    }
  }, [form.date, isPastOrToday, form.bufferDirection])

  const bufferLabel = () => {
    if (!form.bufferDays) return ''
    if (form.bufferDirection === 'before') {
      return `−${Math.round(form.excessKcal / form.bufferDays)} kcal × ${form.bufferDays} pv ennen juhlaa`
    }
    if (form.bufferDirection === 'after') {
      return `−${Math.round(form.excessKcal / form.bufferDays)} kcal × ${form.bufferDays} pv juhlan jälkeen`
    }
    const half = Math.floor(form.bufferDays / 2)
    const total = half * 2
    if (total === 0) return 'Valitse vähintään 2 buffer-päivää'
    return `−${Math.round(form.excessKcal / total)} kcal × ${half} pv ennen + ${half} pv jälkeen`
  }

  const dirBtn = (dir: BufferDirection, label: string, disabled = false) => (
    <Chip
      type="button"
      active={form.bufferDirection === dir}
      onClick={() => !disabled && setForm({ ...form, bufferDirection: dir })}
      className={`justify-center ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
    >
      {label}
    </Chip>
  )

  return (
    <Sheet
      open
      onClose={onClose}
      title={<><PartyPopper size={14} />Juhlapäivä</>}
    >
      <Field
        label="Päivä"
        type="date"
        value={form.date}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
      />

      <Field
        label="Nimi"
        type="text"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="esim. synttärit"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label="Arvio ylimäärä (kcal)"
          type="number"
          value={form.excessKcal}
          onChange={(e) => setForm({ ...form, excessKcal: Number(e.target.value) })}
        />
        <label className="block">
          <span className={fieldLabel}>Buffer-päivät</span>
          <select
            value={form.bufferDays}
            onChange={(e) => setForm({ ...form, bufferDays: Number(e.target.value) })}
            className={selectClass}
          >
            <option value={0}>Ei bufferia</option>
            <option value={1}>1 päivä</option>
            <option value={2}>2 päivää</option>
            <option value={3}>3 päivää</option>
            <option value={4}>4 päivää</option>
            <option value={6}>6 päivää (jos molemmat)</option>
          </select>
        </label>
      </div>

      {form.bufferDays > 0 && (
        <div className="mt-1">
          <span className={fieldLabel}>Buffer-suunta</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {dirBtn('before', 'Ennen', isPastOrToday)}
            {dirBtn('after', 'Jälkeen')}
            {dirBtn('both', 'Molemmat', isPastOrToday)}
          </div>
          <div className="mt-[7px] text-[10px] leading-[1.5] text-[#555]">
            {bufferLabel()}
          </div>
          {isPastOrToday && (
            <div className="mt-1 text-[10px] leading-[1.4] text-danger">
              Juhla on tänään tai menneisyydessä → vain "Jälkeen" mahdollinen
            </div>
          )}
        </div>
      )}

      <div className="mt-[18px] flex gap-2">
        <Button
          variant="primary"
          onClick={() => form.name && onSave(form)}
          disabled={!form.name}
        >
          Tallenna
        </Button>
        <Button variant="ghost" onClick={onClose}>Peru</Button>
      </div>
    </Sheet>
  )
}
