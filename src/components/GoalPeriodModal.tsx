import { useState } from 'react'
import { Target } from 'lucide-react'
import type { GoalPeriod, PeriodType } from '../types'
import { toISO } from '../lib/dates'
import { Sheet, Field, Chip, Button } from './ui'

type FormState = {
  type: PeriodType
  startDate: string
  endDate: string
  startWeight: number
  targetWeight: number
  refillWindowWeeks: number
  expectedRefillKg: number
  label: string
}

interface Props {
  initial?: GoalPeriod
  defaultStartDate?: string
  defaultStartWeight?: number
  onSave: (period: Omit<GoalPeriod, 'id' | 'status' | 'createdAt'>) => void
  onClose: () => void
}

const TYPE_LABEL: Record<PeriodType, string> = {
  cut: 'Cut',
  maintenance: 'Maintenance',
  refill: 'Refill',
  bulk: 'Bulk',
}

const TYPE_HINT: Record<PeriodType, string> = {
  cut: 'Hallittu lasku tavoitepainoon.',
  maintenance: 'Paino pysyy tasaisena ±0,2 kg/vk.',
  refill: 'Kertaluonteinen porras: nousu → tasaantuminen.',
  bulk: 'Hallittu nousu n. +0,2 kg/vk.',
}

export function GoalPeriodModal({
  initial,
  defaultStartDate,
  defaultStartWeight,
  onSave,
  onClose,
}: Props) {
  const today = toISO(new Date())
  const [form, setForm] = useState<FormState>({
    type: initial?.type ?? 'cut',
    startDate: initial?.startDate ?? defaultStartDate ?? today,
    endDate: initial?.endDate ?? today,
    startWeight: initial?.startWeight ?? defaultStartWeight ?? 75,
    targetWeight: initial?.targetWeight ?? 73,
    refillWindowWeeks: initial?.refillWindowWeeks ?? 3,
    expectedRefillKg: initial?.expectedRefillKg ?? 1.8,
    label: initial?.label ?? '',
  })

  const valid =
    form.startDate &&
    form.endDate &&
    form.startDate <= form.endDate &&
    form.startWeight > 0 &&
    form.targetWeight > 0

  const isRefill = form.type === 'refill'

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <>
          <Target size={14} />
          {initial ? 'Muokkaa tavoitejaksoa' : 'Uusi tavoitejakso'}
        </>
      }
    >
      <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted">Tyyppi</span>
      <div className="mb-1 mt-1 grid grid-cols-4 gap-1">
        {(['cut', 'maintenance', 'refill', 'bulk'] as PeriodType[]).map((t) => (
          <Chip
            key={t}
            active={form.type === t}
            onClick={() => setForm({ ...form, type: t })}
            className="justify-center rounded-input px-1 py-2"
          >
            {TYPE_LABEL[t]}
          </Chip>
        ))}
      </div>
      <p className="m-0 mb-3 text-[11px] leading-normal text-white/45">{TYPE_HINT[form.type]}</p>

      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label="Alkaa"
          type="date"
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
        />
        <Field
          label="Päättyy"
          type="date"
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label="Aloituspaino (kg)"
          type="number"
          step="0.1"
          inputMode="decimal"
          value={form.startWeight}
          onChange={(e) => setForm({ ...form, startWeight: Number(e.target.value) })}
        />
        <Field
          label="Tavoitepaino (kg)"
          type="number"
          step="0.1"
          inputMode="decimal"
          value={form.targetWeight}
          onChange={(e) => setForm({ ...form, targetWeight: Number(e.target.value) })}
        />
      </div>

      {isRefill && (
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Ikkuna (vk)"
            type="number"
            min={1}
            max={8}
            inputMode="numeric"
            value={form.refillWindowWeeks}
            onChange={(e) =>
              setForm({ ...form, refillWindowWeeks: Math.max(1, Number(e.target.value)) })
            }
          />
          <Field
            label="Odotettu nousu (kg)"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={form.expectedRefillKg}
            onChange={(e) => setForm({ ...form, expectedRefillKg: Number(e.target.value) })}
          />
        </div>
      )}

      <Field
        label="Tunniste (valinnainen)"
        type="text"
        value={form.label}
        onChange={(e) => setForm({ ...form, label: e.target.value })}
        placeholder="esim. Kesäcut 2026"
      />

      <div className="mt-3.5 flex gap-2">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              type: form.type,
              startDate: form.startDate,
              endDate: form.endDate,
              startWeight: form.startWeight,
              targetWeight: form.targetWeight,
              refillWindowWeeks: isRefill ? form.refillWindowWeeks : undefined,
              expectedRefillKg: isRefill ? form.expectedRefillKg : undefined,
              label: form.label || undefined,
            })
          }
        >
          Tallenna
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Peru
        </Button>
      </div>
    </Sheet>
  )
}
