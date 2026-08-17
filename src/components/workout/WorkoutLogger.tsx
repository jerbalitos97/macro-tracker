import { useState } from 'react'
import { ChevronLeft, Plus, Check, GripVertical, Flame, AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { m } from 'motion/react'
import { Sheet, Button, DragItem, useDragReorder, moveById, moveByDelta } from '../ui'
import type { DragReorder } from '../ui'
import { ExerciseSetSheet } from './ExerciseSetSheet'
import { ExerciseInfoSheet } from './ExerciseInfoSheet'
import { IntervalTimerSheet } from './IntervalTimerSheet'
import type { Workout, LoggedExercise, IntervalConfig, WorkoutTemplate, TemplateExercise } from '../../lib/workouts'
import { uid, lastEntryForExercise, exerciseDone, copySetsForNewSession, DEFAULT_TEMPLATE_COLOR } from '../../lib/workouts'
import { GATE_LABEL, REGION_LABEL } from '../../lib/gates'
import type { GateState } from '../../lib/gates'

interface Props {
  workout: Workout
  /** The template this session came from, when it still exists. Only used to
   *  read the written instructions back — the session itself is self-contained. */
  template?: WorkoutTemplate | null
  onChange: (w: Workout) => void   // every change autosaves the draft upstream
  onFinish: () => void
  /** Opens the day-assessment sheet mid-session. */
  onEditCheck?: () => void
  /** Re-resolve one slot to a chosen state, when a symptom shows up in the
   *  warm-up rather than at the door. */
  onSwapVariant?: (exerciseId: string, state: GateState) => void
  onExit: () => void               // leave but keep the draft
}

function blockSummary(ex: LoggedExercise): string {
  const n = ex.sets.length
  const done = ex.sets.filter((s) => s.done).length
  if (done > 0) return `${done}/${n} tehty`
  if (ex.interval) return `${n} × ${ex.interval.workSeconds}s/${ex.interval.restSeconds}s ×${ex.interval.rounds}`
  return `${n} ${n === 1 ? 'sarja' : 'sarjaa'}`
}

interface TileProps {
  exercise: LoggedExercise
  /** Accent inherited from the workout's template. */
  accent: string
  reorder: DragReorder
  onOpen: () => void
  onToggleDone: () => void
  onMove: (delta: -1 | 1) => void
}

function ExerciseTile({ exercise: ex, accent, reorder, onOpen, onToggleDone, onMove }: TileProps) {
  const done = exerciseDone(ex)

  return (
    <DragItem
      id={ex.id}
      reorder={reorder}
      longPress
      onActivate={onOpen}
      onMove={onMove}
      role="button"
      tabIndex={0}
      ariaLabel={`${ex.name}, ${blockSummary(ex)}`}
      className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col justify-between rounded-tile border p-4 text-left [backdrop-filter:blur(14px)]"
      style={{
        backgroundColor: done ? `${accent}1A` : 'rgba(255,255,255,0.05)',
        borderColor: done ? `${accent}4D` : 'rgba(255,255,255,0.10)',
      }}
    >
      {({ handleProps }) => (
        <>
          {/* Deliberately no instruction button here. The tile is a small target
              in a two-column grid and its whole face opens the movement, so an
              icon on it mostly got hit by accident. The instruction lives one
              level in, where you have already committed to this movement. */}
          <div {...handleProps} className="-m-2 cursor-grab touch-none self-start p-2 active:cursor-grabbing">
            <GripVertical size={16} style={done ? { color: accent } : undefined} className={done ? '' : 'text-fg-faint'} />
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onToggleDone() }}
            aria-label={done ? 'Merkitse tekemättömäksi' : 'Merkitse tehdyksi'}
            className={`hit-44 absolute right-2.5 top-2.5 flex h-8 w-8 !min-h-0 !min-w-0 items-center justify-center rounded-full transition-colors ${
              done ? 'text-bg' : 'border border-white/20 text-fg-faint'
            }`}
            style={done ? { backgroundColor: accent } : undefined}
          >
            <Check size={13} strokeWidth={3} />
          </button>

          <div className="pr-7">
            <div
              className={`line-clamp-2 font-display text-[14px] font-semibold leading-tight ${
                ex.resolution?.unavailable ? 'text-fg-ghost line-through' : 'text-text'
              }`}
            >
              {ex.name}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
              {ex.resolution?.unavailable === 'env'
                ? 'ei mahdollinen täällä'
                : ex.resolution?.unavailable === 'gate'
                  ? 'pois tänään'
                  : blockSummary(ex)}
            </div>
            {/* Where the variant came from — read-only. Without it a substituted
                movement looks like the plan changed by itself, but it is not a
                control: changing the variant lives in the instruction sheet, so
                the tile stays a tile. */}
            {(ex.resolution?.gateRegion || ex.resolution?.envFallback) && (
              <div className="mt-1 truncate font-mono text-[9px] tracking-[0.04em] text-accent/80">
                {[
                  ex.resolution.gateRegion &&
                    `${REGION_LABEL[ex.resolution.gateRegion].toLowerCase()}portti · ${GATE_LABEL[ex.resolution.gateState ?? 'develop']}`,
                  ex.resolution.envFallback && 'paikka',
                  ex.resolution.source === 'manual' && 'käsin',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
        </>
      )}
    </DragItem>
  )
}

export function WorkoutLogger({ workout, template, onChange, onFinish, onExit, onEditCheck, onSwapVariant }: Props) {
  // The instruction sheet is only reachable from inside a movement's own sheet.
  // Sheets do not stack — they share a z-layer and a scroll lock — so it swaps
  // the set grid out and swaps it back on close, landing you where you left.
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [infoReturnTo, setInfoReturnTo] = useState<string | null>(null)
  const escalated = (workout.assessments ?? []).some((a) => a.gateOutput === 'escalate')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const updateExercise = (updated: LoggedExercise) =>
    onChange({ ...workout, exercises: workout.exercises.map((e) => (e.id === updated.id ? updated : e)), updatedAt: new Date().toISOString() })

  const removeExercise = (id: string) =>
    onChange({ ...workout, exercises: workout.exercises.filter((e) => e.id !== id), updatedAt: new Date().toISOString() })

  /** Non-drag reordering (WCAG 2.5.7) — same move the drag performs. */
  const moveExercise = (id: string, delta: -1 | 1) => {
    const arr = moveByDelta(workout.exercises, id, delta)
    if (arr === workout.exercises) return
    onChange({ ...workout, exercises: arr, updatedAt: new Date().toISOString() })
  }

  const reorder = useDragReorder((fromId, toId) => {
    const arr = moveById(workout.exercises, fromId, toId)
    if (arr === workout.exercises) return
    onChange({ ...workout, exercises: arr, updatedAt: new Date().toISOString() })
  })

  const toggleExerciseDone = (ex: LoggedExercise) => {
    const next = !exerciseDone(ex)
    updateExercise({ ...ex, sets: ex.sets.map((s) => ({ ...s, done: next })) })
  }

  const addExercise = () => {
    const name = newName.trim()
    if (!name) return
    const last = lastEntryForExercise(name, workout.id)
    const sets = last && last.sets.length > 0 ? copySetsForNewSession(last.sets) : [{}]
    const ex: LoggedExercise = { id: uid(), name, sets }
    onChange({ ...workout, exercises: [...workout.exercises, ex], updatedAt: new Date().toISOString() })
    setNewName('')
    setAdding(false)
    setOpenId(ex.id)
  }

  /** Find the template slot a logged exercise came from. slotId is the reliable
   *  link; name matching is the fallback for sessions logged before slotId
   *  existed, and it can miss when two slots share a name — better a missing
   *  instruction than the wrong one, so nothing is guessed beyond that. */
  const slotFor = (ex: LoggedExercise): TemplateExercise | null => {
    if (!template) return null
    const id = ex.resolution?.slotId
    if (id) return template.exercises.find((t) => t.id === id) ?? null
    const base = ex.resolution?.baseName
    if (!base) return null
    const matches = template.exercises.filter((t) => t.name === base)
    return matches.length === 1 ? matches[0] : null
  }

  const open = openId ? workout.exercises.find((e) => e.id === openId) ?? null : null
  const openIndex = open ? workout.exercises.findIndex((e) => e.id === open.id) : -1
  const moveUp = openIndex > 0 ? () => moveExercise(open!.id, -1) : null
  const moveDown = openIndex >= 0 && openIndex < workout.exercises.length - 1 ? () => moveExercise(open!.id, 1) : null

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

      {escalated && (
        <div className="mb-3 flex items-start gap-2.5 rounded-row border border-danger/30 bg-danger/[0.08] px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-danger" />
          <div>
            <p className="m-0 text-[13px] font-bold text-danger">Varaa aika ammattilaiselle</p>
            <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-fg-muted">
              Alueen kuormittavat liikkeet on jätetty pois tästä sessiosta.
            </p>
          </div>
        </div>
      )}

      {onEditCheck && (
        <button
          onClick={onEditCheck}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-row border border-white/[0.10] py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted"
        >
          <SlidersHorizontal size={13} /> Muokkaa päiväarviota
        </button>
      )}

      {/* Warm-up tick. Only a fact — that it was done — recorded per session
          so the log can say whether it happens, without asking anyone to write
          the routine down again. */}
      <button
        onClick={() =>
          onChange({ ...workout, warmupDone: !workout.warmupDone, updatedAt: new Date().toISOString() })
        }
        aria-pressed={workout.warmupDone === true}
        className={`mb-3 flex w-full items-center gap-2.5 rounded-row border px-4 py-3 text-left transition-colors ${
          workout.warmupDone
            ? 'border-[rgba(100,200,120,0.30)] bg-[rgba(100,200,120,0.08)] text-[#7fd694]'
            : 'border-dashed border-white/[0.16] bg-transparent text-fg-muted'
        }`}
      >
        {workout.warmupDone ? <Check size={16} /> : <Flame size={16} />}
        <span className="flex-1 text-[13px]">
          {workout.warmupDone ? 'Lämmittely tehty' : 'Merkitse lämmittely tehdyksi'}
        </span>
      </button>

      {/* Exercise blocks */}
      <div ref={reorder.containerRef} className="grid grid-cols-2 gap-3">
        {workout.exercises.map((ex) => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            accent={workout.color ?? DEFAULT_TEMPLATE_COLOR}
            reorder={reorder}
            onOpen={() => setOpenId(ex.id)}
            onToggleDone={() => toggleExerciseDone(ex)}
            onMove={(d) => moveExercise(ex.id, d)}
          />
        ))}

        {/* Add exercise block */}
        <m.button
          layout
          onClick={() => setAdding(true)}
          className="active:scale-[0.97] flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-tile border border-dashed border-white/[0.16] bg-transparent p-4 text-fg-muted transition-transform duration-150"
        >
          <Plus size={22} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">Lisää liike</span>
        </m.button>
      </div>

      {/* Finish bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-white/[0.08] bg-[rgba(5,6,12,0.82)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 [backdrop-filter:blur(20px)]">
        <Button variant="primary" onClick={onFinish} disabled={workout.exercises.length === 0} className="w-full">
          <Check size={18} /> Päätä treeni
        </Button>
      </div>

      {/* What the template says about this movement */}
      {infoFor && (() => {
        const ex = workout.exercises.find((e) => e.id === infoFor)
        if (!ex) return null
        return (
          <ExerciseInfoSheet
            exercise={ex}
            slot={slotFor(ex)}
            templateNote={template?.note}
            onSwapVariant={
              ex.resolution?.gateRegion && onSwapVariant
                ? (state) => {
                    onSwapVariant(ex.id, state)
                    // Back to the set grid so the new prescription is the next
                    // thing you see, rather than the list you just chose from.
                    setInfoFor(null)
                    if (infoReturnTo) { setOpenId(infoReturnTo); setInfoReturnTo(null) }
                  }
                : undefined
            }
            onClose={() => {
              setInfoFor(null)
              if (infoReturnTo) { setOpenId(infoReturnTo); setInfoReturnTo(null) }
            }}
          />
        )
      })()}

      {/* Per-exercise set entry: interval exercises get the clock, others the grid */}
      {open && (open.interval ? (
        <IntervalTimerSheet
          exercise={open as LoggedExercise & { interval: IntervalConfig }}
          onChange={updateExercise}
          onRemoveExercise={() => removeExercise(open.id)}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onShowInfo={() => { setInfoReturnTo(open.id); setInfoFor(open.id); setOpenId(null) }}
          onClose={() => setOpenId(null)}
        />
      ) : (
        <ExerciseSetSheet
          exercise={open}
          suggestion={lastEntryForExercise(open.name, workout.id)}
          onChange={updateExercise}
          onRemoveExercise={() => removeExercise(open.id)}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onShowInfo={() => { setInfoReturnTo(open.id); setInfoFor(open.id); setOpenId(null) }}
          onClose={() => setOpenId(null)}
        />
      ))}

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
