import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import type { ExtraWorkout } from '../types'
import { s } from '../styles/tokens'

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
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} className="modal-enter" onClick={(e) => e.stopPropagation()}>
        {/* Handle bar */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.15)',
          margin: '-8px auto 20px',
        }} />

        <div style={s.modalTitle}>
          <Dumbbell size={14} />
          Ekstratreeni / kävely
        </div>

        <label style={s.inputLabel}>Päivä</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          style={s.input}
        />

        <label style={s.inputLabel}>Kulutus (kcal)</label>
        <input
          type="number"
          value={form.kcal}
          onChange={(e) => setForm({ ...form, kcal: Number(e.target.value) })}
          style={s.input}
          autoFocus
        />

        <label style={s.inputLabel}>Muistiinpano (valinnainen)</label>
        <input
          type="text"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={s.input}
          placeholder="esim. työmatkan kävely"
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={() => onSave(form)} style={s.primaryBtn}>
            Tallenna
          </button>
          <button onClick={onClose} style={s.ghostBtn}>Peru</button>
        </div>
      </div>
    </div>
  )
}
