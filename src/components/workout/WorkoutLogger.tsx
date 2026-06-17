import { useState } from 'react'
import { ChevronLeft, Plus, Check, Dumbbell } from 'lucide-react'
import { Sheet, Button } from '../ui'
import { ExerciseSetSheet } from './ExerciseSetSheet'
import type { Workout, LoggedExercise } from '../../lib/workouts'
import { uid, lastEntryForExercise } from '../../lib/workouts'

interface Props {
  workout: Workout
  onChange: (w: Workout) => void   // every change autosaves the draft upstream
  onFinish: () => void
  onExit: () => void               // leave but keep the draft
}

/** A set has data if any of its fields is filled. */
function hasData(ex: LoggedExercise): boolean {
  return ex.sets.some((s) => s.reps != null || s.weight != null || s.duration != null)
}

function blockSummary(ex: LoggedExercise): string {
  const n = ex.sets.length
  return `${n} ${n === 1 ? 'sarja' : 'sarjaa'}`
}

export function WorkoutLogger({ workout, onChange, onFinish, onExit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const updateExercise = (updated: LoggedExercise) =>
    onChange({ ...workout, exercises: workout.exercises.map((e) => (e.id === updated.id ? updated : e)), updatedAt: new Date().toISOString() })

  const removeExercise = (id: string) =>
    onChange({ ...workout, exercises: workout.exercises.filter((e) => e.id !== id), updatedAt: new Date().toISOString() })

  const addExercise = () => {
    const name = newName.trim()
    if (!name) return
    const last = lastEntryForExercise(name, workout.id)
    const sets = last && last.sets.length > 0 ? last.sets.map((s) => ({ ...s })) : [{}]
    const ex: LoggedExercise = { id: uid(), name, sets }
    onChange({ ...workout, exercises: [...workout.exercises, ex], updatedAt: new Date().toISOString() })
    setNewName('')
    setAdding(false)
    setOpenId(ex.id)
  }

  const open = openId ? workout.exercises.find((e) => e.id === openId) ?? null : null

  return (
    <div className="px-4 pb-28 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onExit}
          aria-label="Takaisin"
          className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-full p-1.5 text-fg-muted"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={workout.name}
            onChange={(e) => onChange({ ...workout, name: e.target.value })}
            className="w-full truncate bg-transparent font-display text-[22px] font-bold tracking-[-0.02em] text-text outline-none"
          />
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">
            Tallennetaan automaattisesti
          </div>
        </div>
      </div>

      {/* Exercise blocks */}
      <div className="grid grid-cols-2 gap-3">
        {workout.exercises.map((ex) => {
          const done = hasData(ex)
          return (
            <button
              key={ex.id}
              onClick={() => setOpenId(ex.id)}
              className="active:scale-[0.97] relative flex min-h-[104px] min-w-0 flex-col justify-between overflow-hidden rounded-tile border p-4 text-left transition-transform duration-150 [backdrop-filter:blur(14px)]"
              style={{
                backgroundColor: done ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.05)',
                borderColor: done ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.10)',
              }}
            >
              {done && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-cyan text-bg">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <Dumbbell size={18} className={done ? 'text-cyan' : 'text-fg-faint'} />
              <div>
                <div className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-text">
                  {ex.name}
                </div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                  {blockSummary(ex)}
                </div>
              </div>
            </button>
          )
        })}

        {/* Add exercise block */}
        <button
          onClick={() => setAdding(true)}
          className="active:scale-[0.97] flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-tile border border-dashed border-white/[0.16] bg-transparent p-4 text-fg-muted transition-transform duration-150"
        >
          <Plus size={22} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">Lisää liike</span>
        </button>
      </div>

      {/* Finish bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-white/[0.08] bg-[rgba(5,6,12,0.82)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 [backdrop-filter:blur(20px)]">
        <Button variant="primary" onClick={onFinish} disabled={workout.exercises.length === 0} className="w-full">
          <Check size={18} /> Päätä treeni
        </Button>
      </div>

      {/* Per-exercise set entry */}
      {open && (
        <ExerciseSetSheet
          exercise={open}
          suggestion={lastEntryForExercise(open.name, workout.id)}
          onChange={updateExercise}
          onRemoveExercise={() => removeExercise(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Add-exercise name entry */}
      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Lisää liike">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExercise()}
            placeholder="Liikkeen nimi"
            autoFocus
            className="mb-3 w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-sm text-text"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Peru</Button>
            <Button variant="primary" onClick={addExercise} disabled={!newName.trim()}>
              <Plus size={16} /> Lisää
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
