import { useRef, useState } from 'react'
import { ChevronLeft, Plus, Check, GripVertical } from 'lucide-react'
import { m, useDragControls } from 'motion/react'
import { Sheet, Button } from '../ui'
import { ExerciseSetSheet } from './ExerciseSetSheet'
import type { Workout, LoggedExercise } from '../../lib/workouts'
import { uid, lastEntryForExercise, exerciseDone, copySetsForNewSession } from '../../lib/workouts'

interface Props {
  workout: Workout
  onChange: (w: Workout) => void   // every change autosaves the draft upstream
  onFinish: () => void
  onExit: () => void               // leave but keep the draft
}

function blockSummary(ex: LoggedExercise): string {
  const n = ex.sets.length
  const done = ex.sets.filter((s) => s.done).length
  if (done > 0) return `${done}/${n} tehty`
  return `${n} ${n === 1 ? 'sarja' : 'sarjaa'}`
}

interface TileProps {
  exercise: LoggedExercise
  onOpen: () => void
  onToggleDone: () => void
  /** Snapshot tile positions right when a drag starts. */
  onMeasure: () => void
  /** Drop at a page-space point; parent decides the new order. */
  onDrop: (id: string, point: { x: number; y: number }) => void
}

function ExerciseTile({ exercise: ex, onOpen, onToggleDone, onMeasure, onDrop }: TileProps) {
  const controls = useDragControls()
  const dragged = useRef(false)
  const done = exerciseDone(ex)

  return (
    <m.div
      layout
      data-exid={ex.id}
      drag
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragMomentum={false}
      whileDrag={{ scale: 1.06, zIndex: 40, boxShadow: '0 14px 36px rgba(0,0,0,0.55)' }}
      whileTap={{ scale: 0.97 }}
      onDragStart={() => { dragged.current = true; onMeasure() }}
      onDragEnd={(_, info) => onDrop(ex.id, info.point)}
      onClick={() => {
        // A click bubbles in after a drag ends — don't open the sheet then.
        if (dragged.current) { dragged.current = false; return }
        onOpen()
      }}
      className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col justify-between rounded-tile border p-4 text-left [backdrop-filter:blur(14px)]"
      style={{
        backgroundColor: done ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.05)',
        borderColor: done ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.10)',
      }}
    >
      <div
        onPointerDown={(e) => { e.preventDefault(); controls.start(e) }}
        aria-label="Järjestä raahaamalla"
        className="-m-2 cursor-grab touch-none self-start p-2 active:cursor-grabbing"
      >
        <GripVertical size={16} className={done ? 'text-cyan' : 'text-fg-faint'} />
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onToggleDone() }}
        aria-label={done ? 'Merkitse tekemättömäksi' : 'Merkitse tehdyksi'}
        className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          done ? 'bg-cyan text-bg' : 'border border-white/20 text-fg-faint'
        }`}
      >
        <Check size={13} strokeWidth={3} />
      </button>

      <div>
        <div className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-text">
          {ex.name}
        </div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
          {blockSummary(ex)}
        </div>
      </div>
    </m.div>
  )
}

export function WorkoutLogger({ workout, onChange, onFinish, onExit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const gridRef = useRef<HTMLDivElement>(null)
  const tileRects = useRef<Array<{ id: string; rect: DOMRect }>>([])

  const updateExercise = (updated: LoggedExercise) =>
    onChange({ ...workout, exercises: workout.exercises.map((e) => (e.id === updated.id ? updated : e)), updatedAt: new Date().toISOString() })

  const removeExercise = (id: string) =>
    onChange({ ...workout, exercises: workout.exercises.filter((e) => e.id !== id), updatedAt: new Date().toISOString() })

  const toggleExerciseDone = (ex: LoggedExercise) => {
    const next = !exerciseDone(ex)
    updateExercise({ ...ex, sets: ex.sets.map((s) => ({ ...s, done: next })) })
  }

  const measureTiles = () => {
    const root = gridRef.current
    if (!root) return
    tileRects.current = Array.from(root.querySelectorAll<HTMLElement>('[data-exid]')).map((el) => ({
      id: el.dataset.exid as string,
      rect: el.getBoundingClientRect(),
    }))
  }

  const dropExercise = (fromId: string, point: { x: number; y: number }) => {
    // info.point is page-space; the rects were captured in viewport-space.
    const x = point.x - window.scrollX
    const y = point.y - window.scrollY
    const target = tileRects.current.find(
      ({ id, rect }) => id !== fromId && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
    )
    if (!target) return
    const arr = [...workout.exercises]
    const from = arr.findIndex((e) => e.id === fromId)
    const to = arr.findIndex((e) => e.id === target.id)
    if (from < 0 || to < 0 || from === to) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    onChange({ ...workout, exercises: arr, updatedAt: new Date().toISOString() })
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
      <div ref={gridRef} className="grid grid-cols-2 gap-3">
        {workout.exercises.map((ex) => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            onOpen={() => setOpenId(ex.id)}
            onToggleDone={() => toggleExerciseDone(ex)}
            onMeasure={measureTiles}
            onDrop={dropExercise}
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
