import { useState } from 'react'
import { Sliders } from 'lucide-react'
import { Sheet, Field, Chip, Button } from './ui'

interface Props {
  date: string
  current: { kcal: number; note: string } | null  // existing adjustment for the day, if any
  onSave: (kcal: number, note: string) => void
  onDelete?: () => void
  onClose: () => void
}

const PRESETS = [-200, -150, -100, -50, 50, 100, 150, 200] as const

export function AdjustmentModal({ date, current, onSave, onDelete, onClose }: Props) {
  const [kcalText, setKcalText] = useState<string>(current ? String(current.kcal) : '-150')
  const [note, setNote] = useState<string>(current?.note ?? '')

  const parsed = Number(kcalText)
  const valid = Number.isFinite(parsed) && parsed !== 0

  return (
    <Sheet
      open
      onClose={onClose}
      title={<><Sliders size={14} />Päivän säätö · {date}</>}
    >
      <p className="mb-3.5 text-xs leading-[1.55] text-white/50">
        Lisää tai vähennä päivän kaloribudjettia. Negatiivinen luku tiukentaa päivää
        (esim. <span className="text-white">−150</span> = 150 kcal vähemmän ruokaa, vajetta enemmän).
        Positiivinen löysää.
      </p>

      <Field
        label="Säätö (kcal, etumerkillä)"
        type="number"
        value={kcalText}
        onChange={(e) => setKcalText(e.target.value)}
        autoFocus
        inputMode="numeric"
      />

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {PRESETS.map((p) => (
          <Chip
            key={p}
            active={parsed === p}
            onClick={() => setKcalText(String(p))}
            className="justify-center tabular-nums"
          >
            {p > 0 ? `+${p}` : p}
          </Chip>
        ))}
      </div>

      <Field
        label="Muistiinpano (valinnainen)"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="esim. tavoitelinjalle paluu"
      />

      <div className="mt-[18px] flex gap-2">
        <Button
          variant="primary"
          onClick={() => valid && onSave(parsed, note)}
          disabled={!valid}
        >
          Tallenna
        </Button>
        {current && onDelete && (
          <Button variant="ghost" onClick={onDelete} className="text-danger">
            Poista
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Peru
        </Button>
      </div>
    </Sheet>
  )
}
