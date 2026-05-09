import { useState } from 'react'
import { Sliders } from 'lucide-react'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { s } from '../styles/tokens'

interface Props {
  date: string
  current: { kcal: number; note: string } | null  // existing adjustment for the day, if any
  onSave: (kcal: number, note: string) => void
  onDelete?: () => void
  onClose: () => void
}

const PRESETS = [-200, -150, -100, -50, 50, 100, 150, 200] as const

export function AdjustmentModal({ date, current, onSave, onDelete, onClose }: Props) {
  useBodyScrollLock()
  const [kcalText, setKcalText] = useState<string>(current ? String(current.kcal) : '-150')
  const [note, setNote] = useState<string>(current?.note ?? '')

  const parsed = Number(kcalText)
  const valid = Number.isFinite(parsed) && parsed !== 0

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
          <Sliders size={14} />
          Päivän säätö · {date}
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
          Lisää tai vähennä päivän kaloribudjettia. Negatiivinen luku tiukentaa päivää
          (esim. <span style={{ color: '#fff' }}>−150</span> = 150 kcal vähemmän ruokaa, vajetta enemmän).
          Positiivinen löysää.
        </p>

        <label style={s.inputLabel}>Säätö (kcal, etumerkillä)</label>
        <input
          type="number"
          value={kcalText}
          onChange={(e) => setKcalText(e.target.value)}
          style={s.input}
          autoFocus
          inputMode="numeric"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setKcalText(String(p))}
              style={{
                ...s.toggleBtn,
                ...(parsed === p ? s.toggleBtnActive : {}),
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {p > 0 ? `+${p}` : p}
            </button>
          ))}
        </div>

        <label style={s.inputLabel}>Muistiinpano (valinnainen)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={s.input}
          placeholder="esim. tavoitelinjalle paluu"
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={() => valid && onSave(parsed, note)}
            disabled={!valid}
            style={{ ...s.primaryBtn, opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'not-allowed' }}
          >
            Tallenna
          </button>
          {current && onDelete && (
            <button onClick={onDelete} style={{ ...s.ghostBtn, color: '#e87a6a' }}>
              Poista
            </button>
          )}
          <button onClick={onClose} style={s.ghostBtn}>
            Peru
          </button>
        </div>
      </div>
    </div>
  )
}
