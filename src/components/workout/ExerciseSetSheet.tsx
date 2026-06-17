import { useState } from 'react'
import { Plus, X, Trash2, Check } from 'lucide-react'
import { Sheet, Button } from '../ui'
import type { LoggedExercise, SetEntry } from '../../lib/workouts'

interface Props {
  exercise: LoggedExercise
  /** Most recent prior logging of this exercise, shown as a hint. */
  suggestion?: LoggedExercise | null
  onChange: (updated: LoggedExercise) => void
  onRemoveExercise: () => void
  onClose: () => void
}

const cell =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-1.5 py-2 text-center text-sm tabular-nums text-text [color-scheme:dark]'
const colLabel = 'font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-faint'

function num(v: string): number | undefined {
  if (v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function summarize(ex: LoggedExercise): string {
  return ex.sets
    .map((s) => {
      const parts: string[] = []
      if (s.reps != null) parts.push(`${s.reps}`)
      if (s.weight != null) parts.push(`${s.weight}kg`)
      if (s.duration != null) parts.push(`${s.duration}s`)
      return parts.join('·') || '–'
    })
    .join('  ')
}

export function ExerciseSetSheet({ exercise, suggestion, onChange, onRemoveExercise, onClose }: Props) {
  const [sets, setSets] = useState<SetEntry[]>(exercise.sets.length ? exercise.sets : [{}])

  const commit = (next: SetEntry[]) => {
    setSets(next)
    onChange({ ...exercise, sets: next })
  }

  const patchSet = (i: number, p: Partial<SetEntry>) =>
    commit(sets.map((s, idx) => (idx === i ? { ...s, ...p } : s)))

  const addSet = () => {
    const last = sets[sets.length - 1] ?? {}
    commit([...sets, { ...last }])
  }

  const removeSet = (i: number) => commit(sets.filter((_, idx) => idx !== i))

  return (
    <Sheet open onClose={onClose} title={<span className="normal-case">{exercise.name}</span>}>
      {suggestion && (
        <div className="mb-3 rounded-row border border-cyan/20 bg-cyan/[0.07] px-3 py-2">
          <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-cyan">Viime kerralla</div>
          <div className="font-mono text-[11px] tabular-nums text-fg-muted">{summarize(suggestion)}</div>
        </div>
      )}

      {/* Column headers */}
      <div className="mb-1.5 grid grid-cols-[24px_1fr_1fr_1fr_32px] items-center gap-2 px-0.5">
        <span className={colLabel}>#</span>
        <span className={`${colLabel} text-center`}>Toistot</span>
        <span className={`${colLabel} text-center`}>Paino kg</span>
        <span className={`${colLabel} text-center`}>Aika s</span>
        <span />
      </div>

      <div className="flex flex-col gap-1.5">
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_32px] items-center gap-2">
            <span className="text-center font-mono text-[12px] tabular-nums text-fg-faint">{i + 1}</span>
            <input inputMode="numeric" value={s.reps ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { reps: num(e.target.value) })} className={cell} />
            <input inputMode="decimal" value={s.weight ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { weight: num(e.target.value) })} className={cell} />
            <input inputMode="numeric" value={s.duration ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { duration: num(e.target.value) })} className={cell} />
            <button
              onClick={() => removeSet(i)}
              disabled={sets.length <= 1}
              aria-label="Poista sarja"
              className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1 text-fg-faint hover:text-danger disabled:opacity-30"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addSet}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.14] bg-transparent py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted"
      >
        <Plus size={14} /> Lisää sarja
      </button>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => { onRemoveExercise(); onClose() }}
          className="inline-flex items-center justify-center gap-1.5 rounded-input border border-danger/30 bg-danger/[0.08] px-4 py-3 font-mono text-[12px] text-danger"
        >
          <Trash2 size={14} /> Poista
        </button>
        <Button variant="primary" onClick={onClose}>
          <Check size={16} /> Valmis
        </Button>
      </div>
    </Sheet>
  )
}
