import { useState } from 'react'
import { Target } from 'lucide-react'
import type { GoalPeriod, PeriodType } from '../types'
import { toISO } from '../lib/dates'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { s } from '../styles/tokens'

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
  useBodyScrollLock()
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

  const compactInput: React.CSSProperties = { ...s.input, padding: '10px 12px', fontSize: 14, marginTop: 4, marginBottom: 6 }
  const compactToggle: React.CSSProperties = { ...s.toggleBtn, padding: '8px 4px' }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} className="modal-enter" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.15)',
            margin: '-4px auto 12px',
          }}
        />

        <div style={s.modalTitle}>
          <Target size={14} />
          {initial ? 'Muokkaa tavoitejaksoa' : 'Uusi tavoitejakso'}
        </div>

        <label style={s.inputLabel}>Tyyppi</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 4, marginBottom: 4 }}>
          {(['cut', 'maintenance', 'refill', 'bulk'] as PeriodType[]).map((t) => {
            const active = form.type === t
            return (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                style={{ ...compactToggle, ...(active ? s.toggleBtnActive : {}) }}
              >
                {TYPE_LABEL[t]}
              </button>
            )
          })}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          {TYPE_HINT[form.type]}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={s.inputLabel}>Alkaa</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={compactInput}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Päättyy</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              style={compactInput}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={s.inputLabel}>Aloituspaino (kg)</label>
            <input
              type="number"
              step="0.1"
              value={form.startWeight}
              onChange={(e) => setForm({ ...form, startWeight: Number(e.target.value) })}
              style={compactInput}
              inputMode="decimal"
            />
          </div>
          <div>
            <label style={s.inputLabel}>Tavoitepaino (kg)</label>
            <input
              type="number"
              step="0.1"
              value={form.targetWeight}
              onChange={(e) => setForm({ ...form, targetWeight: Number(e.target.value) })}
              style={compactInput}
              inputMode="decimal"
            />
          </div>
        </div>

        {isRefill && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={s.inputLabel}>Ikkuna (vk)</label>
              <input
                type="number"
                min={1}
                max={8}
                value={form.refillWindowWeeks}
                onChange={(e) =>
                  setForm({ ...form, refillWindowWeeks: Math.max(1, Number(e.target.value)) })
                }
                style={compactInput}
                inputMode="numeric"
              />
            </div>
            <div>
              <label style={s.inputLabel}>Odotettu nousu (kg)</label>
              <input
                type="number"
                step="0.1"
                value={form.expectedRefillKg}
                onChange={(e) => setForm({ ...form, expectedRefillKg: Number(e.target.value) })}
                style={compactInput}
                inputMode="decimal"
              />
            </div>
          </div>
        )}

        <label style={s.inputLabel}>Tunniste (valinnainen)</label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          style={compactInput}
          placeholder="esim. Kesäcut 2026"
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
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
            style={{ ...s.primaryBtn, opacity: valid ? 1 : 0.4 }}
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
