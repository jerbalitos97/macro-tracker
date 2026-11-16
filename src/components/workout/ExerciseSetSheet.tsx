import { useState } from 'react'
import { Plus, X, Trash2, Check, ArrowUp, ArrowDown, Info } from 'lucide-react'
import { Sheet, Button } from '../ui'
import type { LoggedExercise, SetEntry } from '../../lib/workouts'

interface Props {
  exercise: LoggedExercise
  /** Most recent prior logging of this exercise, shown as a hint. */
  suggestion?: LoggedExercise | null
  onChange: (updated: LoggedExercise) => void
  onRemoveExercise: () => void
  /** Reorder without dragging (WCAG 2.5.7). Null at the ends of the list. */
  onMoveUp: (() => void) | null
  onMoveDown: (() => void) | null
  /** Show what the template prescribed for this movement. */
  onShowInfo?: () => void
  onClose: () => void
}

const cell =
  'h-11 w-full min-w-0 rounded-[10px] border border-white/[0.18] bg-[var(--surface-2)] px-1.5 text-center font-mono text-[16px] tabular-nums text-text [color-scheme:dark]'
const colLabel = 'text-[12px] text-fg-muted'

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

export function ExerciseSetSheet({ exercise, suggestion, onChange, onRemoveExercise, onMoveUp, onMoveDown, onShowInfo, onClose }: Props) {
  const [sets, setSets] = useState<SetEntry[]>(exercise.sets.length ? exercise.sets : [{}])

  const commit = (next: SetEntry[]) => {
    setSets(next)
    onChange({ ...exercise, sets: next })
  }

  const patchSet = (i: number, p: Partial<SetEntry>) =>
    commit(sets.map((s, idx) => (idx === i ? { ...s, ...p } : s)))

  const addSet = () => {
    const last = { ...(sets[sets.length - 1] ?? {}) }
    delete last.done // a new set starts unchecked
    commit([...sets, last])
  }

  const removeSet = (i: number) => commit(sets.filter((_, idx) => idx !== i))

  return (
    <Sheet open onClose={onClose} title={<span className="normal-case">{exercise.name}</span>}>
      {/* Reachable from inside the set grid too: the prescription is most worth
          re-reading exactly when you are deciding what to type. */}
      {onShowInfo && (
        <button
          onClick={onShowInfo}
          className="mb-3 flex min-h-10 items-center gap-2 self-start rounded-full px-3 text-[14px] font-semibold text-cyan"
        >
          <Info size={16} /> Pohjan ohje
        </button>
      )}

      {/* Parallel choices, when the plan is asking you to pick the room rather
          than the other way round. Both are spelled out with the place each
          needs, because the point is to decide which gym to walk into. */}
      {exercise.alternatives && exercise.alternatives.length > 1 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[12px] text-fg-muted">
            Valitse paikan mukaan
          </div>
          <div className="flex flex-col gap-1.5">
            {exercise.alternatives.map((alt) => {
              const active = alt.name === exercise.name
              return (
                <button
                  key={alt.name}
                  onClick={() => active ? undefined : onChange({ ...exercise, name: alt.name, tempo: alt.tempo, note: [alt.note, alt.dose].filter(Boolean).join(' · ') || undefined })}
                  aria-pressed={active}
                  className={`min-h-12 w-full rounded-[8px] border px-3 py-2 text-left ${
                    active ? 'border-transparent bg-cyan/[0.16]' : 'border-white/[0.18]'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] leading-5 text-text">{alt.name}</span>
                    <span className="flex-shrink-0 font-mono text-[12px] tabular-nums text-fg-muted">{alt.dose}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    {alt.placeLabel && (
                      <span className={`text-[12px] ${active ? 'text-[#a5f3fc]' : 'text-fg-muted'}`}>
                        {alt.placeLabel}
                      </span>
                    )}
                    {alt.note && <span className="text-[12px] leading-4 text-fg-muted">{alt.note}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {suggestion && (
        <div className="mb-3 rounded-[16px] bg-cyan/[0.10] px-3.5 py-2.5">
          <div className="mb-0.5 text-[12px] text-[#a5f3fc]">Viime kerralla</div>
          <div className="font-mono text-[14px] tabular-nums text-text">{summarize(suggestion)}</div>
        </div>
      )}

      {/* Column headers */}
      <div className="mb-1.5 grid grid-cols-[20px_1fr_1fr_1fr_40px_32px] items-center gap-2 px-0.5">
        <span className={colLabel}>#</span>
        <span className={`${colLabel} text-center`}>Toistot</span>
        <span className={`${colLabel} text-center`}>Paino kg</span>
        <span className={`${colLabel} text-center`}>Aika s</span>
        <span className={`${colLabel} text-center`}>OK</span>
        <span />
      </div>

      <div className="flex flex-col gap-1.5">
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[20px_1fr_1fr_1fr_40px_32px] items-center gap-2">
            <span className="text-center font-mono text-[14px] tabular-nums text-fg-muted">{i + 1}</span>
            <input inputMode="numeric" value={s.reps ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { reps: num(e.target.value) })} className={cell} />
            <input inputMode="decimal" value={s.weight ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { weight: num(e.target.value) })} className={cell} />
            <input inputMode="numeric" value={s.duration ?? ''} placeholder="–"
              onChange={(e) => patchSet(i, { duration: num(e.target.value) })} className={cell} />
            <button
              onClick={() => patchSet(i, { done: !s.done })}
              aria-label={s.done ? 'Merkitse sarja tekemättömäksi' : 'Merkitse sarja tehdyksi'}
              className={`hit-44 flex h-10 w-10 !min-h-0 !min-w-0 items-center justify-center rounded-full transition-colors ${
                s.done ? 'bg-gradient-to-br from-cyan to-violet text-bg' : 'border-2 border-white/30 text-fg-muted'
              }`}
            >
              <Check size={16} strokeWidth={3} />
            </button>
            <button
              onClick={() => removeSet(i)}
              disabled={sets.length <= 1}
              aria-label="Poista sarja"
              className="icon-btn hit-44 flex h-8 w-8 !min-h-0 !min-w-0 items-center justify-center rounded-full text-fg-muted hover:text-danger disabled:opacity-30"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addSet}
        className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/[0.18] bg-transparent text-[14px] font-medium text-text"
      >
        <Plus size={16} /> Lisää sarja
      </button>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onMoveUp?.()}
          disabled={!onMoveUp}
          aria-label="Siirrä liike ylöspäin"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.18] text-text disabled:opacity-25"
        >
          <ArrowUp size={16} />
        </button>
        <button
          onClick={() => onMoveDown?.()}
          disabled={!onMoveDown}
          aria-label="Siirrä liike alaspäin"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.18] text-text disabled:opacity-25"
        >
          <ArrowDown size={16} />
        </button>
        <button
          onClick={() => { onRemoveExercise(); onClose() }}
          aria-label="Poista liike"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.18] text-[#FFB4AB]"
        >
          <Trash2 size={16} />
        </button>
        <Button variant="primary" onClick={onClose}>
          <Check size={16} /> Valmis
        </Button>
      </div>
    </Sheet>
  )
}
