import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Plus, Check, GripVertical } from 'lucide-react'
import { m, useDragControls } from 'motion/react'
import { Sheet, Button } from '../ui'
import { ExerciseSetSheet } from './ExerciseSetSheet'
import { IntervalTimerSheet } from './IntervalTimerSheet'
import type { Workout, LoggedExercise, IntervalConfig } from '../../lib/workouts'
import { uid, lastEntryForExercise, exerciseDone, copySetsForNewSession, DEFAULT_TEMPLATE_COLOR } from '../../lib/workouts'

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
  if (ex.interval) return `${n} × ${ex.interval.workSeconds}s/${ex.interval.restSeconds}s ×${ex.interval.rounds}`
  return `${n} ${n === 1 ? 'sarja' : 'sarjaa'}`
}

interface TileProps {
  exercise: LoggedExercise
  /** Accent inherited from the workout's template. */
  accent: string
  onOpen: () => void
  onToggleDone: () => void
  /** Snapshot tile positions right when a drag starts. */
  onMeasure: () => void
  /** Drop at a page-space point; parent decides the new order. */
  onDrop: (id: string, point: { x: number; y: number }) => void
}

/** Hold this long anywhere on a tile to pick it up (iOS home-screen feel). */
const LONG_PRESS_MS = 350
/** Move further than this before the hold completes and it's a scroll, not a lift. */
const MOVE_TOLERANCE_PX = 10
/** Clicks arriving this soon after a drag are the drag's own click — ignore them. */
const CLICK_SUPPRESS_MS = 300

function ExerciseTile({ exercise: ex, accent, onOpen, onToggleDone, onMeasure, onDrop }: TileProps) {
  const controls = useDragControls()
  const done = exerciseDone(ex)

  const [lifted, setLifted] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const dragEndedAt = useRef(0)

  const cancelPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressOrigin.current = null
  }, [])

  const beginDrag = useCallback((e: React.PointerEvent) => {
    cancelPress()
    setLifted(true)
    onMeasure()
    controls.start(e)
    // Light haptic where supported (Android); a no-op on iOS Safari.
    navigator.vibrate?.(12)
  }, [cancelPress, controls, onMeasure])

  // The tile keeps `touch-action: auto` so the page still scrolls under a
  // swipe. Once a tile is lifted, block scrolling for the rest of the gesture
  // — changing touch-action mid-touch is not honoured on iOS, but a
  // non-passive preventDefault is.
  useEffect(() => {
    if (!lifted) return
    const block = (e: TouchEvent) => e.preventDefault()
    window.addEventListener('touchmove', block, { passive: false })
    return () => window.removeEventListener('touchmove', block)
  }, [lifted])

  useEffect(() => cancelPress, [cancelPress])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      beginDrag(e)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const origin = pressOrigin.current
    if (!origin || pressTimer.current === null) return
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_TOLERANCE_PX) cancelPress()
  }

  return (
    <m.div
      layout
      data-exid={ex.id}
      role="button"
      tabIndex={0}
      aria-label={`${ex.name}, ${blockSummary(ex)}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      drag
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragMomentum={false}
      whileDrag={{ scale: 1.06, zIndex: 40, boxShadow: '0 14px 36px rgba(0,0,0,0.55)' }}
      whileTap={lifted ? undefined : { scale: 0.97 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={() => { cancelPress(); setLifted(false) }}
      onDragEnd={(_, info) => {
        dragEndedAt.current = Date.now()
        setLifted(false)
        onDrop(ex.id, info.point)
      }}
      onClick={() => {
        // The click that ends a drag arrives right after it — ignore that one
        // only. A timestamp self-heals if a drag ever ends without a click.
        if (lifted || Date.now() - dragEndedAt.current < CLICK_SUPPRESS_MS) return
        onOpen()
      }}
      className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col justify-between rounded-tile border p-4 text-left [backdrop-filter:blur(14px)]"
      style={{
        backgroundColor: done ? `${accent}1A` : 'rgba(255,255,255,0.05)',
        borderColor: done ? `${accent}4D` : 'rgba(255,255,255,0.10)',
      }}
    >
      <div
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e) }}
        aria-label="Järjestä raahaamalla"
        className="-m-2 cursor-grab touch-none self-start p-2 active:cursor-grabbing"
      >
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

  /** Non-drag reordering (WCAG 2.5.7) — same move the drag performs. */
  const moveExercise = (id: string, delta: -1 | 1) => {
    const arr = [...workout.exercises]
    const from = arr.findIndex((e) => e.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= arr.length) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    onChange({ ...workout, exercises: arr, updatedAt: new Date().toISOString() })
  }

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

      {/* Exercise blocks */}
      <div ref={gridRef} className="grid grid-cols-2 gap-3">
        {workout.exercises.map((ex) => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            accent={workout.color ?? DEFAULT_TEMPLATE_COLOR}
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

      {/* Per-exercise set entry: interval exercises get the clock, others the grid */}
      {open && (open.interval ? (
        <IntervalTimerSheet
          exercise={open as LoggedExercise & { interval: IntervalConfig }}
          onChange={updateExercise}
          onRemoveExercise={() => removeExercise(open.id)}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
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
