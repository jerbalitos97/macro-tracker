import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Sheet } from './ui'
import { MealCapture } from './ruoka/MealCapture'
import { parsePositiveInt, parsePositiveDecimal, isValidDecimalInput } from '../lib/format'

type NewMeal = { kcal: number; protein: number; description?: string; items?: string[] }

// Aterian kirjaus: kaksi numeroa ja Tallenna. Ei nimeä, ei hakua, ei
// "viimeksi syötyjä" — kirjaus on luvut, ja kaikki muu oli kenttiä joita
// ohitettiin. Kuva-arvio on yksi nappi lukujen alla, ei rinnakkainen polku.
//
// Avautuu Tänään-näkymän "Kirjaa ateria" -napista. Yhteinen Tänään-näkymälle
// ja kirjaustilalle, jotta sama lomake ei elä kahtena kopiona.

export function MealFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-[max(16px,calc((100vw-480px)/2+16px))] z-20 flex h-14 items-center gap-3 rounded-2xl bg-gradient-to-br from-cyan to-blue pl-4 pr-5 text-[16px] font-semibold text-bg shadow-[0_10px_28px_-8px_rgba(34,211,238,0.65)]"
    >
      <Plus size={24} strokeWidth={2.25} />
      Kirjaa ateria
    </button>
  )
}

export function MealSheet({
  open, onClose, onAdd, remaining, canPhoto,
}: {
  open: boolean
  onClose: () => void
  onAdd: (meal: NewMeal) => void
  /** Päivän jäljellä oleva budjetti ennen tätä ateriaa; null kirjaustilassa. */
  remaining: number | null
  canPhoto: boolean
}) {
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')

  const close = () => { setKcal(''); setProtein(''); onClose() }

  const submit = () => {
    const k = parsePositiveInt(kcal)
    if (!k || k <= 0) return
    onAdd({ kcal: k, protein: parsePositiveDecimal(protein) })
    close()
  }

  const typed = parsePositiveInt(kcal) || 0
  const field =
    'h-[72px] w-full rounded-2xl border bg-[var(--surface-2)] px-4 text-[32px] font-light tabular-nums text-white'

  return (
    <Sheet open={open} onClose={close} title="Kirjaa ateria">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5 text-[14px] text-fg-muted">
            Kalorit
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={kcal}
              onChange={(e) => { if (/^\d*$/.test(e.target.value)) setKcal(e.target.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              className={`${field} border-cyan/35`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-[14px] text-fg-muted">
            Proteiini (g)
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={protein}
              onChange={(e) => { const v = e.target.value; if (isValidDecimalInput(v) || v === '') setProtein(v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              className={`${field} border-white/[0.18]`}
            />
          </label>
        </div>
        {remaining !== null && (
          <p className="m-0 text-[14px] text-fg-muted">
            Budjettia jää tämän jälkeen {Math.round(remaining - typed).toLocaleString('fi-FI')} kcal
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!typed}
          className="h-14 rounded-full bg-gradient-to-br from-cyan to-blue text-[16px] font-semibold text-bg shadow-[0_10px_28px_-8px_rgba(34,211,238,0.65)] disabled:opacity-50"
        >
          Tallenna
        </button>
        {canPhoto && (
          <MealCapture
            onAccept={(m) => { onAdd({ kcal: m.kcal, protein: m.protein, description: m.description, items: m.items }); close() }}
          />
        )}
      </div>
    </Sheet>
  )
}
