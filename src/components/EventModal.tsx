import { useState, useEffect } from 'react'
import { PartyPopper } from 'lucide-react'
import type { SpecialEvent, BufferDirection } from '../types'
import { toISO } from '../lib/dates'
import { s } from '../styles/tokens'

type FormState = Omit<SpecialEvent, 'id'>

interface Props {
  defaultDate: string
  onSave: (ev: FormState) => void
  onClose: () => void
}

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
    <button
      type="button"
      onClick={() => !disabled && setForm({ ...form, bufferDirection: dir })}
      style={{
        ...s.toggleBtn,
        ...(form.bufferDirection === dir ? s.toggleBtnActive : {}),
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )

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
          <PartyPopper size={14} />
          Juhlapäivä
        </div>

        <label style={s.inputLabel}>Päivä</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          style={s.input}
        />

        <label style={s.inputLabel}>Nimi</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={s.input}
          placeholder="esim. synttärit"
          autoFocus
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={s.inputLabel}>Arvio ylimäärä (kcal)</label>
            <input
              type="number"
              value={form.excessKcal}
              onChange={(e) => setForm({ ...form, excessKcal: Number(e.target.value) })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Buffer-päivät</label>
            <select
              value={form.bufferDays}
              onChange={(e) => setForm({ ...form, bufferDays: Number(e.target.value) })}
              style={{ ...s.input, colorScheme: 'dark' }}
            >
              <option value={0}>Ei bufferia</option>
              <option value={1}>1 päivä</option>
              <option value={2}>2 päivää</option>
              <option value={3}>3 päivää</option>
              <option value={4}>4 päivää</option>
              <option value={6}>6 päivää (jos molemmat)</option>
            </select>
          </div>
        </div>

        {form.bufferDays > 0 && (
          <div style={{ marginTop: 4 }}>
            <label style={s.inputLabel}>Buffer-suunta</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
              {dirBtn('before', 'Ennen', isPastOrToday)}
              {dirBtn('after', 'Jälkeen')}
              {dirBtn('both', 'Molemmat', isPastOrToday)}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 7, lineHeight: 1.5 }}>
              {bufferLabel()}
            </div>
            {isPastOrToday && (
              <div style={{ fontSize: 10, color: '#e87a6a', marginTop: 4, lineHeight: 1.4 }}>
                Juhla on tänään tai menneisyydessä → vain "Jälkeen" mahdollinen
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={() => form.name && onSave(form)}
            disabled={!form.name}
            style={{ ...s.primaryBtn, opacity: form.name ? 1 : 0.35 }}
          >
            Tallenna
          </button>
          <button onClick={onClose} style={s.ghostBtn}>Peru</button>
        </div>
      </div>
    </div>
  )
}
