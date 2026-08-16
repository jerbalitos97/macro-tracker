import { useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import { Sheet, Button } from '../ui'
import { BLOCK_COLORS, findOverlap } from '../../lib/blocks'
import type { TrainingBlock } from '../../lib/blocks'
import { INTENTS, INTENT_ORDER, intentOf } from '../../lib/planning'
import type { BlockIntent } from '../../lib/planning'
import { daysBetween } from '../../lib/dates'

interface Props {
  block: TrainingBlock
  /** Every block, used to reject overlapping date ranges. */
  all: TrainingBlock[]
  isNew: boolean
  onSave: (b: TrainingBlock) => void
  onDelete: () => void
  onClose: () => void
}

const label = 'mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const field =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-sm text-text [color-scheme:dark]'

export function BlockEditorSheet({ block, all, isNew, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(block.name)
  const [startDate, setStartDate] = useState(block.startDate)
  const [endDate, setEndDate] = useState(block.endDate)
  const [color, setColor] = useState(block.color)
  const [note, setNote] = useState(block.note ?? '')
  // A block used to be a coloured date range with a name — nothing a nutrition
  // plan could read. The intent is what makes the two plannable against each
  // other at all.
  const [intent, setIntent] = useState<BlockIntent>(intentOf(block))
  const [error, setError] = useState<string | null>(null)

  const lengthDays = endDate >= startDate ? daysBetween(startDate, endDate) + 1 : 0
  const weeks = lengthDays > 0 ? (lengthDays / 7).toFixed(lengthDays % 7 === 0 ? 0 : 1) : '0'

  const handleSave = () => {
    if (!name.trim()) return setError('Anna blokille nimi.')
    if (endDate < startDate) return setError('Loppupäivä on ennen alkupäivää.')
    const clash = findOverlap(all, { id: block.id, startDate, endDate })
    if (clash) {
      return setError(`Päivät menevät päällekkäin blokin "${clash.name || 'nimetön'}" kanssa.`)
    }
    onSave({
      ...block,
      name: name.trim(),
      startDate,
      endDate,
      color,
      intent,
      note: note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Uusi treeniblokki' : 'Muokkaa blokkia'}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={label} htmlFor="block-name">Nimi</label>
          <input
            id="block-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            placeholder="esim. Syksy 2026 · voimablokki"
            autoFocus={isNew}
            className={field}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="block-start">Alkaa</label>
            <input
              id="block-start"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setError(null) }}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="block-end">Päättyy</label>
            <input
              id="block-end"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setError(null) }}
              className={field}
            />
          </div>
        </div>

        <div className="font-mono text-[11px] text-fg-muted">
          Pituus: {lengthDays} päivää ({weeks} vk)
        </div>

        <div>
          <label className={label}>Mitä blokki tavoittelee</label>
          <div className="grid grid-cols-2 gap-1.5">
            {INTENT_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => setIntent(k)}
                aria-pressed={intent === k}
                className={`rounded-input border px-3 py-2 text-left !min-h-0 !min-w-0 ${
                  intent === k
                    ? 'border-accent/45 bg-accent/[0.10] text-text'
                    : 'border-white/10 bg-black/[0.35] text-fg-muted'
                }`}
              >
                <span className="block text-[12px] font-semibold">{INTENTS[k].label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-fg-faint">
            {INTENTS[intent].blurb}{' '}
            {INTENTS[intent].maxWeeklyLossPct === null
              ? 'Ravinto ajetaan ylläpidolla.'
              : `Kestää enintään noin ${INTENTS[intent].maxWeeklyLossPct} % kehonpainosta viikossa pudotusta.`}
          </p>
        </div>

        <div>
          <label className={label}>Väri</label>
          <div className="flex flex-wrap gap-2">
            {BLOCK_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Väri ${c}`}
                aria-pressed={color === c}
                className={`h-9 w-9 !min-h-0 !min-w-0 rounded-full ${
                  color === c ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={label} htmlFor="block-note">Tavoite (valinnainen)</label>
          <input
            id="block-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="esim. straddle planche 5s"
            className={field}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => { if (window.confirm('Poistetaanko blokki?')) { onDelete(); onClose() } }}
              aria-label="Poista blokki"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-danger/30 bg-danger/[0.08] text-danger"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="ghost" onClick={onClose}>Peru</Button>
          <Button variant="primary" onClick={handleSave}>
            <Check size={16} /> Tallenna
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
