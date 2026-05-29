import { useState } from 'react'
import { TrendingDown, CalendarDays } from 'lucide-react'
import { fromISO, toISO } from '../lib/dates'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { s } from '../styles/tokens'

interface Props {
  surplusDate: string      // ISO date of the day the surplus was earned
  surplus: number          // kcal of extra deficit beyond plan
  cutEndDate: string       // settings.endDate — caps the "pick a day" picker
  onApplySpread: (days: number) => void
  onApplySingle: (date: string) => void
  onDismiss: () => void
}

const SPREAD_OPTIONS = [3, 5, 7] as const

export function SurplusPrompt({
  surplusDate,
  surplus,
  cutEndDate,
  onApplySpread,
  onApplySingle,
  onDismiss,
}: Props) {
  useBodyScrollLock()
  const today = toISO(new Date())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState(today)

  const dateLabel = fromISO(surplusDate).toLocaleDateString('fi-FI', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div style={s.modalBg} onClick={onDismiss}>
      <div style={s.modal} className="modal-enter" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.15)',
            margin: '-4px auto 14px',
          }}
        />

        <div style={s.modalTitle}>
          <TrendingDown size={14} />
          Lisäbudjettia jaettavaksi
        </div>

        <p
          style={{
            margin: '0 0 14px',
            fontSize: 13,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.55,
          }}
        >
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} vajetta kertyi{' '}
          <strong style={{ color: '#8acb88' }}>
            {surplus.toLocaleString('fi-FI')} kcal
          </strong>{' '}
          yli suunnitellun. Voit antaa tämän ylimäärän bonuksena tuleville päiville.
        </p>

        {!pickerOpen ? (
          <>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                marginBottom: 6,
              }}
            >
              Jaa tasaisesti
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${SPREAD_OPTIONS.length}, 1fr)`,
                gap: 6,
                marginBottom: 14,
              }}
            >
              {SPREAD_OPTIONS.map((n) => {
                const perDay = Math.floor(surplus / n)
                return (
                  <button
                    key={n}
                    onClick={() => onApplySpread(n)}
                    style={{ ...s.toggleBtn, padding: '10px 6px', textAlign: 'center' }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: '#fff',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      +{perDay}
                      <span style={{ color: '#777', fontWeight: 400 }}> kcal/pv</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
                      {n} päivälle
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPickerOpen(true)}
              style={{
                ...s.secondaryBtn,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <CalendarDays size={14} />
              Valitse yksittäinen päivä…
            </button>

            <button
              onClick={onDismiss}
              style={{ ...s.ghostBtn, width: '100%' }}
            >
              Ohita
            </button>
          </>
        ) : (
          <>
            <label style={s.inputLabel}>Lisää koko ylimäärä päivälle</label>
            <input
              type="date"
              value={picked}
              min={today}
              max={cutEndDate}
              onChange={(e) => setPicked(e.target.value)}
              style={s.input}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => onApplySingle(picked)}
                style={s.primaryBtn}
              >
                Lisää +{surplus.toLocaleString('fi-FI')} kcal
              </button>
              <button
                onClick={() => setPickerOpen(false)}
                style={s.ghostBtn}
              >
                Takaisin
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
