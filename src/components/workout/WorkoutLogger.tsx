import { useMemo, useState } from 'react'
import { ChevronLeft, Plus, Check, GripVertical, Flame, AlertTriangle } from 'lucide-react'
import { m } from 'motion/react'
import { Sheet, Button, DragItem, useDragReorder, moveById, moveByDelta } from '../ui'
import type { DragReorder } from '../ui'
import { ExerciseSetSheet } from './ExerciseSetSheet'
import { ExerciseInfoSheet } from './ExerciseInfoSheet'
import { WarmupPackageSheet } from './WarmupPackageSheet'
import { warmupById, resolveWarmup } from '../../lib/warmups'
import { IntervalTimerSheet } from './IntervalTimerSheet'
import type { Workout, LoggedExercise, IntervalConfig, WorkoutTemplate, TemplateExercise } from '../../lib/workouts'
import { uid, lastEntryForExercise, exerciseDone, copySetsForNewSession, exerciseCatalogue, DEFAULT_TEMPLATE_COLOR } from '../../lib/workouts'
import type { GateState } from '../../lib/gates'
import { celebrate } from '../../lib/flash'

interface Props {
  workout: Workout
  /** The template this session came from, when it still exists. Only used to
   *  read the written instructions back — the session itself is self-contained. */
  template?: WorkoutTemplate | null
  onChange: (w: Workout) => void   // every change autosaves the draft upstream
  onFinish: () => void
  /** The day assessment is reachable from the tools button, not from here. */
  /** Re-resolve one slot to a chosen state, when a symptom shows up in the
   *  warm-up rather than at the door. */
  onSwapVariant?: (exerciseId: string, state: GateState) => void
  onExit: () => void               // leave but keep the draft
}

/** "12.9." ISO-päivästä. Vuosi jätetään pois: rivi kertoo milloin liike on
 *  viimeksi tehty, ja se on hyödyllinen vain suhteessa tähän päivään. */
function dayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`
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
      flashTint={accent}
      className={`relative flex min-h-[116px] min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-[24px] border p-[14px] text-left ${
        done
          ? 'border-[rgba(34,211,238,0.35)] bg-[linear-gradient(135deg,rgba(34,211,238,0.26),rgba(167,139,250,0.24))]'
          : 'border-white/[0.08] bg-[var(--surface-1)]'
      }`}
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
            onClick={(e) => {
              e.stopPropagation()
              onToggleDone()
              if (!done) celebrate(e.currentTarget, accent)
            }}
            aria-label={done ? 'Merkitse tekemättömäksi' : 'Merkitse tehdyksi'}
            className={`hit-44 absolute bottom-3 right-3 flex h-10 w-10 !min-h-0 !min-w-0 items-center justify-center rounded-full transition-colors ${
              done ? 'bg-gradient-to-br from-cyan to-violet text-bg' : 'border-2 border-white/30 text-fg-muted'
            }`}
          >
            <Check size={18} strokeWidth={3} />
          </button>

          <div className="pr-11">
            <div
              className={`line-clamp-2 text-[16px] font-medium leading-5 ${
                ex.resolution?.unavailable ? 'text-fg-ghost line-through' : 'text-text'
              }`}
            >
              {ex.name}
            </div>
            <div className="mt-1 text-[12px] leading-4 text-fg-muted">
              {ex.resolution?.unavailable === 'env'
                ? 'ei mahdollinen täällä'
                : ex.resolution?.unavailable === 'gate'
                  ? 'pois tänään'
                  : blockSummary(ex)}
            </div>
            {/* Deliberately nothing about gates or substitutions here. Which
                gate produced this variant is worth knowing but not worth a line
                on every tile — it lives in the instruction sheet, next to the
                variants it is choosing between. The tile says what to do and
                how far along you are, and stops. */}
          </div>
        </>
      )}
    </DragItem>
  )
}

export function WorkoutLogger({ workout, template, onChange, onFinish, onExit, onSwapVariant }: Props) {
  // The instruction sheet is only reachable from inside a movement's own sheet.
  // Sheets do not stack — they share a z-layer and a scroll lock — so it swaps
  // the set grid out and swaps it back on close, landing you where you left.
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [infoReturnTo, setInfoReturnTo] = useState<string | null>(null)
  const [warmupOpen, setWarmupOpen] = useState(false)

  // The warm-up reads differently depending on the day: the wrist items become
  // a rehab dose when the wrist is being treated, and one template a week
  // carries the progressive external-rotation dose.
  const warmup = warmupById(template?.warmupId)
  const gateStates = useMemo(() => {
    const out: Partial<Record<'knee' | 'back' | 'wrist', { state: GateState }>> = {}
    for (const a of workout.assessments ?? []) {
      if (a.gateOutput) out[a.bodyRegion] = { state: a.gateOutput }
    }
    return out
  }, [workout.assessments])
  const warmupItems = useMemo(
    () => resolveWarmup(warmup, gateStates, template?.warmupProgressive === true),
    [warmup, gateStates, template?.warmupProgressive],
  )
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

  const addExercise = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    const last = lastEntryForExercise(name, workout.id)
    const sets = last && last.sets.length > 0 ? copySetsForNewSession(last.sets) : [{}]
    const ex: LoggedExercise = { id: uid(), name, sets }
    onChange({ ...workout, exercises: [...workout.exercises, ex], updatedAt: new Date().toISOString() })
    setNewName('')
    setAdding(false)
    setOpenId(ex.id)
  }

  // Luettelo luetaan vasta kun lisäysluukku avataan: se käy läpi koko historian
  // ja kaikki pohjat, eikä sitä tarvita ennen kuin jotain ollaan lisäämässä.
  const catalogue = useMemo(() => (adding ? exerciseCatalogue() : []), [adding])
  const query = newName.trim().toLowerCase()
  const matches = useMemo(
    () => (query ? catalogue.filter((c) => c.name.toLowerCase().includes(query)) : catalogue).slice(0, 60),
    [catalogue, query],
  )
  // Uusi nimi tarjotaan vasta kun se ei ole jo luettelossa sellaisenaan.
  // Osittainen osuma ei riitä: "dippi" on eri liike kuin "dipit".
  const canCreate = query.length > 0 && !catalogue.some((c) => c.name.toLowerCase() === query)
  const inWorkout = useMemo(
    () => new Set(workout.exercises.map((e) => e.name.trim().toLowerCase())),
    [workout.exercises],
  )

  /** Enter lisää vain kun kirjoitettu teksti on yksiselitteinen: tasan sama
   *  nimi kuin luettelossa, tai nimi jota luettelo ei tunne lainkaan. Kesken
   *  kirjoitettu haku ("kuula") ei ole kummankaan, ja Enter siinä kohtaa
   *  tekisi liikkeen nimeltä "kuula". Silloin ei tapahdu mitään, ja valinta
   *  tehdään listalta. */
  const submit = () => {
    const exact = catalogue.find((c) => c.name.toLowerCase() === query)
    if (exact) return addExercise(exact.name)
    if (canCreate && matches.length === 0) addExercise(newName)
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
    <div className="px-4 pb-28 pt-2">
      {/* Header */}
      <div className="mb-3 flex items-center gap-1">
        <button
          onClick={onExit}
          aria-label="Takaisin"
          className="icon-btn flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-text"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={workout.name}
            onChange={(e) => onChange({ ...workout, name: e.target.value })}
            aria-label="Treenin nimi"
            className="h-11 w-full truncate border-b border-white/[0.18] bg-transparent px-1 text-[22px] font-medium text-text outline-none"
          />
          <div className="px-1 pt-1 text-[12px] leading-4 text-fg-muted">
            Tallennetaan automaattisesti
          </div>
        </div>
      </div>

      {escalated && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[16px] bg-[#452826] px-3.5 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[#FFB4AB]" />
          <div>
            <p className="m-0 text-[14px] font-semibold text-[#FFB4AB]">Varaa aika ammattilaiselle</p>
            <p className="m-0 mt-0.5 text-[14px] leading-5 text-[#FFB4AB]">
              Alueen kuormittavat liikkeet on jätetty pois tästä sessiosta.
            </p>
          </div>
        </div>
      )}

      {/* The warm-up. When the template names a package the button opens it —
          the routine is content in the database, so it can be read here instead
          of remembered. Without a package it stays a bare tick, which is what
          every older template gets. */}
      <button
        onClick={() =>
          warmupItems.length > 0
            ? setWarmupOpen(true)
            : onChange({ ...workout, warmupDone: !workout.warmupDone, updatedAt: new Date().toISOString() })
        }
        aria-pressed={workout.warmupDone === true}
        className={`mb-3 flex min-h-16 w-full items-center gap-3 rounded-[20px] border px-4 py-2.5 text-left transition-colors ${
          workout.warmupDone
            ? 'border-[rgba(100,200,120,0.30)] bg-[rgba(100,200,120,0.10)] text-[#7fd694]'
            : 'border-white/[0.08] bg-[var(--surface-1)] text-text'
        }`}
      >
        {workout.warmupDone ? <Check size={16} /> : <Flame size={16} />}
        <span className="flex-1 text-[15px] font-semibold">
          {warmupItems.length > 0
            ? `${warmup?.name ?? 'Lämmittely'}${workout.warmupDone ? ' · tehty' : ''}`
            : workout.warmupDone ? 'Lämmittely tehty' : 'Merkitse lämmittely tehdyksi'}
        </span>
        {warmupItems.length > 0 && (
          <span className="text-[12px] opacity-85">
            {warmupItems.length} liikettä
          </span>
        )}
      </button>

      {warmupOpen && warmup && (
        <WarmupPackageSheet
          name={warmup.name}
          note={warmup.note}
          items={warmupItems}
          done={workout.warmupDone === true}
          onToggleDone={() =>
            onChange({ ...workout, warmupDone: !workout.warmupDone, updatedAt: new Date().toISOString() })
          }
          onClose={() => setWarmupOpen(false)}
        />
      )}

      {/* Exercise blocks */}
      <div ref={reorder.containerRef} className="grid grid-cols-2 gap-2.5">
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
          onClick={() => { setNewName(''); setAdding(true) }}
          className="flex min-h-[116px] min-w-0 flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-white/[0.18] bg-[var(--surface-1)] p-[14px] text-cyan"
        >
          <Plus size={22} />
          <span className="text-[15px] font-medium">Lisää liike</span>
        </m.button>
      </div>

      {/* Finish bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-white/[0.08] bg-[#0c0d18] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
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
          workoutId={workout.id}
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

      {/* Liikkeen lisäys: sama kenttä hakee tunnetuista ja kirjoittaa uuden.
          Kaksi erillistä tilaa ("valitse" / "kirjoita uusi") tarkoittaisi että
          oikea valitaan ennen kuin tietää kumpaa tarvitsee — ja juuri sitä ei
          kesken treenin tiedä. Kirjoitetaan, ja lista kertoo onko liike jo
          olemassa. Luettelo on johdettu pohjista ja historiasta, joten uusi
          liike liittyy siihen itsestään kun treeni tallennetaan. */}
      {adding && (
        <Sheet open onClose={() => { setAdding(false); setNewName('') }} title="Lisää liike">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Hae tai kirjoita uusi"
            autoFocus
            className="mb-3 w-full min-h-12 rounded-[12px] border border-white/[0.18] bg-[var(--surface-2)] px-[14px] py-[11px] text-[16px] text-text"
          />

          <div className="max-h-[46vh] overflow-y-auto overscroll-contain">
            {matches.map((c) => {
              const already = inWorkout.has(c.name.toLowerCase())
              return (
                <button
                  key={c.name}
                  onClick={() => addExercise(c.name)}
                  className="mb-[2px] flex min-h-14 w-full items-center gap-3 rounded-[14px] bg-[var(--surface-2)] px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-6 text-text">{c.name}</span>
                    <span className="block text-[14px] leading-5 text-fg-muted">
                      {c.lastUsed ? `viimeksi ${dayMonth(c.lastUsed)}` : c.inTemplate ? 'pohjissa' : 'ei vielä tehty'}
                      {already && ' · jo listalla'}
                    </span>
                  </span>
                  <Plus size={18} className="flex-shrink-0 text-cyan" />
                </button>
              )
            })}

            {/* Uuden luonti on listan alla eikä päällä. Haku on kesken joka
                painalluksen ajan, ja "kuula" osuu kahvakuulaheilautukseen
                vaikka se ei ole liikkeen nimi — ylimmäisenä se rivi tulisi
                osuttua ohimennen, ja treeniin jäisi "kuula". Alimmaisena se on
                yhtä saatavilla mutta vaatii että sinne asti mennään. */}
            {canCreate && (
              <button
                onClick={() => addExercise(newName)}
                className={`flex w-full items-center gap-2.5 min-h-14 rounded-[14px] border border-dashed border-cyan/40 bg-cyan/[0.08] px-3 py-2 text-left ${
                  matches.length > 0 ? 'mt-2' : ''
                }`}
              >
                <Plus size={18} className="flex-shrink-0 text-cyan" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-text">{newName.trim()}</span>
                  <span className="block text-[14px] text-cyan">
                    Uusi liike
                  </span>
                </span>
              </button>
            )}

            {matches.length === 0 && !canCreate && (
              <p className="m-0 px-1 py-6 text-center text-[14px] leading-5 text-fg-muted">
                Ei vielä yhtään liikettä. Kirjoita nimi niin se syntyy tähän.
              </p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="ghost" onClick={() => { setAdding(false); setNewName('') }}>Peru</Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
