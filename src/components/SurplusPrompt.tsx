import { useState } from 'react'
import { TrendingDown, CalendarDays } from 'lucide-react'
import { fromISO, toISO } from '../lib/dates'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { Button, Field } from './ui'

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
    /* Backdrop */
    <div
      className="backdrop-enter fixed inset-0 z-[100] overscroll-contain [backdrop-filter:blur(6px)] [-webkit-backdrop-filter:blur(6px)] bg-black/[0.72]"
      onClick={onDismiss}
    >
      {/* Bottom sheet */}
      <div
        className="modal-enter fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-[20px] border border-white/[0.1] bg-modal px-5 pt-6 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] shadow-[0_-16px_60px_rgba(0,0,0,0.70)]"
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 64px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="-mt-1 mx-auto mb-3.5 h-1 w-9 rounded-sm bg-white/[0.15]" />

        {/* Title */}
        <div className="mb-[18px] flex items-center gap-2 font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-accent">
          <TrendingDown size={14} />
          Lisäbudjettia jaettavaksi
        </div>

        <p className="m-0 mb-3.5 text-[13px] leading-[1.55] text-white/75">
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} vajetta kertyi{' '}
          <strong className="text-[#34d399]">
            {surplus.toLocaleString('fi-FI')} kcal
          </strong>{' '}
          yli suunnitellun. Voit antaa tämän ylimäärän bonuksena tuleville päiville.
        </p>

        {!pickerOpen ? (
          <>
            {/* Spread label */}
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white/40">
              Jaa tasaisesti
            </div>

            {/* Spread grid */}
            <div
              className="mb-3.5 grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${SPREAD_OPTIONS.length}, 1fr)` }}
            >
              {SPREAD_OPTIONS.map((n) => {
                const perDay = Math.floor(surplus / n)
                return (
                  <button
                    key={n}
                    onClick={() => onApplySpread(n)}
                    className="rounded-[8px] border border-white/[0.08] bg-black/30 px-1.5 py-[10px] text-center text-[#777] cursor-pointer"
                  >
                    <div className="text-[13px] font-bold tabular-nums text-text">
                      +{perDay}
                      <span className="font-normal text-[#777]"> kcal/pv</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#777]">
                      {n} päivälle
                    </div>
                  </button>
                )
              })}
            </div>

            <Button
              variant="secondary"
              onClick={() => setPickerOpen(true)}
              className="mb-2 flex w-full items-center justify-center gap-2"
            >
              <CalendarDays size={14} />
              Valitse yksittäinen päivä…
            </Button>

            <Button
              variant="ghost"
              onClick={onDismiss}
              className="w-full"
            >
              Ohita
            </Button>
          </>
        ) : (
          <>
            <Field
              label="Lisää koko ylimäärä päivälle"
              type="date"
              value={picked}
              min={today}
              max={cutEndDate}
              onChange={(e) => setPicked(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => onApplySingle(picked)}>
                Lisää +{surplus.toLocaleString('fi-FI')} kcal
              </Button>
              <Button variant="ghost" onClick={() => setPickerOpen(false)}>
                Takaisin
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
