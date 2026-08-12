import { useEffect, useRef, useState } from 'react'
import { Plus, Dumbbell, ClipboardList, CalendarDays, Play, Trash2, X, ChevronRight, ChevronLeft, Timer, Layers, Bell, BellOff, GripVertical } from 'lucide-react'
import { Card, Button, Sheet, DragItem, useDragReorder, moveById, moveByDelta } from '../components/ui'
import { TemplateEditor } from '../components/workout/TemplateEditor'
import { WarmupFab } from '../components/workout/WarmupSheet'
import { WorkoutLogger } from '../components/workout/WorkoutLogger'
import { WorkoutSummary } from '../components/workout/WorkoutSummary'
import { WorkoutSuccess } from '../components/workout/WorkoutSuccess'
import { toISO, fromISO, addDays } from '../lib/dates'
import { useAuth } from '../contexts/AuthContext'
import {
  getTemplates, saveTemplate, deleteTemplate, reorderTemplates,
  pullTemplates, syncTemplateCloud, deleteTemplateCloud,
  getWorkouts, saveWorkout, deleteWorkout,
  pullWorkouts, syncWorkoutCloud, deleteWorkoutCloud,
  getDraft, saveDraft, clearDraft, newWorkout,
} from '../lib/workouts'
import { DEFAULT_TEMPLATE_COLOR } from '../lib/workouts'
import type { Workout, WorkoutTemplate, TemplateKind } from '../lib/workouts'
import { BlockEditorSheet } from '../components/workout/BlockEditorSheet'
import {
  getBlocks, saveBlockLocal, deleteBlockLocal, newBlock,
  pullBlocks, syncBlockCloud, deleteBlockCloud,
  blockForDate, blockStatus, BLOCK_ENDING_SOON_DAYS,
} from '../lib/blocks'
import type { TrainingBlock } from '../lib/blocks'
import {
  notifyPermission, requestNotifyPermission, maybeNotifyBlockEnding, resetNotifyGuard,
} from '../lib/blockNotify'
import type { NotifyPermission } from '../lib/blockNotify'

type Tab = 'log' | 'templates' | 'calendar'
type Screen = 'home' | 'logging' | 'summary' | 'editTemplate'

const TABS: Array<{ id: Tab; label: string; Icon: typeof Dumbbell }> = [
  { id: 'log',       label: 'Treeni',    Icon: Dumbbell },
  { id: 'templates', label: 'Pohjat',    Icon: ClipboardList },
  { id: 'calendar',  label: 'Kalenteri', Icon: CalendarDays },
]

const sectionLabel = 'mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim'

const KINDS: Array<{ id: TemplateKind; label: string; Icon: typeof Dumbbell }> = [
  { id: 'strength', label: 'Voimatreeni',   Icon: Dumbbell },
  { id: 'mobility', label: 'Liikkuvuustreeni', Icon: Timer },
]

/** Templates saved before the kind/colour fields existed default to strength. */
const templateKind = (t: WorkoutTemplate): TemplateKind => (t.kind === 'mobility' ? 'mobility' : 'strength')
const templateColor = (t: WorkoutTemplate): string => t.color ?? DEFAULT_TEMPLATE_COLOR

interface GroupProps {
  group: WorkoutTemplate[]
  onOpen: (t: WorkoutTemplate) => void
  onDelete: (id: string) => void
  /** Receives the whole group's new id order; positions are stored per kind. */
  onReorder: (orderedIds: string[]) => void
}

/** One kind's template tiles. Hold a tile to pick it up and drop it on the slot
 *  it should take; Alt+Arrow does the same from the keyboard. */
function TemplateGroup({ group, onOpen, onDelete, onReorder }: GroupProps) {
  const apply = (next: WorkoutTemplate[]) => {
    if (next !== group) onReorder(next.map((t) => t.id))
  }
  const reorder = useDragReorder((fromId, toId) => apply(moveById(group, fromId, toId)))

  return (
    <div ref={reorder.containerRef} className="grid grid-cols-2 gap-3">
      {group.map((t) => {
        const c = templateColor(t)
        return (
          <DragItem
            key={t.id}
            id={t.id}
            reorder={reorder}
            longPress
            onActivate={() => onOpen(t)}
            onMove={(d) => apply(moveByDelta(group, t.id, d))}
            role="button"
            tabIndex={0}
            ariaLabel={`Muokkaa pohjaa ${t.name}, ${t.exercises.length} liikettä`}
            className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-tile border p-4 [backdrop-filter:blur(14px)]"
            style={{ borderColor: `${c}55`, backgroundColor: `${c}14` }}
          >
            {({ handleProps }) => (
              <>
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c }} />
                <div className="flex items-start justify-between gap-1">
                  <div {...handleProps} className="-m-1.5 cursor-grab touch-none p-1.5 active:cursor-grabbing">
                    <GripVertical size={16} style={{ color: c }} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(t.id) }}
                    aria-label={`Poista pohja ${t.name}`}
                    className="icon-btn hit-44 flex !min-h-0 !min-w-0 items-center justify-center rounded-md p-1 text-fg-faint hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div>
                  <div className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-text">
                    {t.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                    {t.exercises.length} liikettä
                  </div>
                </div>
              </>
            )}
          </DragItem>
        )
      })}
    </div>
  )
}

export function WorkoutView() {
  const todayISO = toISO(new Date())
  const { user } = useAuth()

  const [screen, setScreen] = useState<Screen>('home')
  const [tab, setTab] = useState<Tab>('log')

  const [templates, setTemplates] = useState<WorkoutTemplate[]>(() => getTemplates())
  const [workouts, setWorkouts] = useState<Workout[]>(() => getWorkouts())
  const [draft, setDraft] = useState<Workout | null>(() => getDraft())

  const [session, setSession] = useState<Workout | null>(null)
  const [viewing, setViewing] = useState<Workout | null>(null)
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null)
  const [success, setSuccess] = useState(false)
  // Editing an already-completed workout: saves straight to history + cloud,
  // never touches the in-progress draft.
  const [pastEdit, setPastEdit] = useState(false)
  const cloudSyncTimer = useRef<number | null>(null)

  // Which category's template picker is open (null = closed).
  const [picking, setPicking] = useState<TemplateKind | null>(null)

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selectedDay, setSelectedDay] = useState<string>(todayISO)

  const [blocks, setBlocks] = useState<TrainingBlock[]>(() => getBlocks())
  const [editingBlock, setEditingBlock] = useState<{ block: TrainingBlock; isNew: boolean } | null>(null)
  const [notifyState, setNotifyState] = useState<NotifyPermission>(() => notifyPermission())

  // Refresh templates and history from the cloud when logged in.
  useEffect(() => {
    if (!user) return
    let alive = true
    pullTemplates(user.id).then((ts) => { if (alive) setTemplates(ts) })
    pullWorkouts(user.id).then((ws) => { if (alive) setWorkouts(ws) })
    pullBlocks(user.id).then((bs) => { if (alive) setBlocks(bs) })
    return () => { alive = false }
  }, [user])

  // Autosave on every change: drafts stay local until finished; past-workout
  // edits persist to history immediately and to the cloud debounced.
  useEffect(() => {
    if (screen !== 'logging' || !session) return
    if (pastEdit) {
      setWorkouts(saveWorkout(session))
      if (user) {
        if (cloudSyncTimer.current) window.clearTimeout(cloudSyncTimer.current)
        const snapshot = session
        cloudSyncTimer.current = window.setTimeout(() => syncWorkoutCloud(user.id, snapshot), 800)
      }
    } else {
      saveDraft(session)
      setDraft(session)
    }
  }, [session, screen, pastEdit, user])

  // ── Session lifecycle ────────────────────────────────────────────
  const startWorkout = (template?: WorkoutTemplate) => {
    setPicking(null)
    const w = newWorkout(todayISO, template)
    setSession(w)
    saveDraft(w)
    setDraft(w)
    setScreen('logging')
  }

  const continueDraft = () => {
    if (!draft) return
    setSession(draft)
    setScreen('logging')
  }

  const discardDraft = () => {
    if (!window.confirm('Hylätäänkö keskeneräinen treeni?')) return
    clearDraft()
    setDraft(null)
    setSession(null)
  }

  const finishWorkout = () => {
    if (!session) return
    const saved: Workout = { ...session, completed: true, updatedAt: new Date().toISOString() }
    setWorkouts(saveWorkout(saved))
    if (user) syncWorkoutCloud(user.id, saved)
    if (pastEdit) {
      setPastEdit(false)
      setSession(null)
      setViewing(saved)
      setScreen('summary')
      return
    }
    clearDraft()
    setDraft(null)
    setSession(null)
    setViewing(saved)
    setSuccess(true)
  }

  const startEditPast = (w: Workout) => {
    setSession(w)
    setPastEdit(true)
    setScreen('logging')
  }

  const exitLogging = () => {
    if (pastEdit && session) {
      const saved: Workout = { ...session, completed: true, updatedAt: new Date().toISOString() }
      setWorkouts(saveWorkout(saved))
      if (user) syncWorkoutCloud(user.id, saved)
      setPastEdit(false)
      setSession(null)
      setViewing(saved)
      setScreen('summary')
      return
    }
    setScreen('home')
  }

  // ── Training blocks ──────────────────────────────────────────────
  const status = blockStatus(blocks, todayISO)

  const handleSaveBlock = (b: TrainingBlock) => {
    setBlocks(saveBlockLocal(b))
    if (user) syncBlockCloud(user.id, b)
    // A changed block means a fresh countdown — let today's reminder fire again.
    resetNotifyGuard()
    setEditingBlock(null)
  }

  const handleDeleteBlock = (id: string) => {
    setBlocks(deleteBlockLocal(id))
    if (user) deleteBlockCloud(user.id, id)
    resetNotifyGuard()
  }

  // Fire the once-a-day reminder on open and whenever the app returns to the
  // foreground. iOS can't schedule notifications for a closed web app, so this
  // is the reachable half; the UI says so next to the toggle.
  useEffect(() => {
    if (notifyState !== 'granted') return
    const check = () => { if (document.visibilityState === 'visible') maybeNotifyBlockEnding(status) }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [notifyState, status.current?.id, status.daysLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Templates ────────────────────────────────────────────────────
  const handleSaveTemplate = (t: WorkoutTemplate) => {
    setTemplates(saveTemplate(t))
    if (user) syncTemplateCloud(user.id, t)
    setEditing(null)
    setScreen('home')
    setTab('templates')
  }

  /** Persist a new manual order for one kind. Every template in the kind gets a
   *  fresh position, so all of them go up to the cloud, not just the moved one. */
  const handleReorderTemplates = (kind: TemplateKind, orderedIds: string[]) => {
    const next = reorderTemplates(kind, orderedIds)
    setTemplates(next)
    if (user) {
      for (const t of next) if (templateKind(t) === kind) syncTemplateCloud(user.id, t)
    }
  }

  const handleDeleteTemplate = (id: string) => {
    if (!window.confirm('Poistetaanko pohja?')) return
    setTemplates(deleteTemplate(id))
    if (user) deleteTemplateCloud(user.id, id)
  }

  // ── Sub-screens ──────────────────────────────────────────────────
  if (screen === 'logging' && session) {
    return (
      <>
        <WorkoutLogger
          workout={session}
          onChange={setSession}
          onFinish={finishWorkout}
          onExit={exitLogging}
        />
        <WarmupFab />
        {success && <WorkoutSuccess onDone={() => { setSuccess(false); setScreen('summary') }} />}
      </>
    )
  }

  if (success) {
    return <WorkoutSuccess onDone={() => { setSuccess(false); setScreen('summary') }} />
  }

  if (screen === 'summary' && viewing) {
    return (
      <>
        <WorkoutSummary
          workout={viewing}
          onDelete={(id) => {
            setWorkouts(deleteWorkout(id))
            if (user) deleteWorkoutCloud(user.id, id)
          }}
          onEdit={() => startEditPast(viewing)}
          onClose={() => { setViewing(null); setScreen('home'); setTab('calendar') }}
        />
        <WarmupFab />
      </>
    )
  }

  if (screen === 'editTemplate') {
    return (
      <>
        <TemplateEditor
          initial={editing ?? undefined}
          onSave={handleSaveTemplate}
          onCancel={() => { setEditing(null); setScreen('home') }}
        />
        <WarmupFab />
      </>
    )
  }

  // ── Home (3 tabs) ────────────────────────────────────────────────
  return (
    <div className="px-4 pb-10 pt-4">
      <h1 className="mb-3 font-display text-[22px] font-bold tracking-[-0.02em] text-text">Workout</h1>

      {/* Segmented tabs */}
      <div role="tablist" aria-label="Workout-näkymät" className="mb-4 grid grid-cols-3 gap-1 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-1">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex min-h-0 items-center justify-center gap-1.5 rounded-[14px] py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                active ? 'bg-gradient-to-br from-cyan to-violet text-bg' : 'text-fg-muted'
              }`}
            >
              <t.Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'log' && (
        <div className="flex flex-col gap-2.5">
          {draft && (
            <Card variant="glass" className="border-cyan/25">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">Kesken</div>
                  <div className="mt-0.5 truncate font-display text-[16px] font-semibold text-text">{draft.name}</div>
                  <div className="font-mono text-[10px] text-fg-faint">
                    {draft.exercises.length} liikettä
                  </div>
                </div>
                <button
                  onClick={discardDraft}
                  aria-label="Hylkää"
                  className="icon-btn flex min-h-0 min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
                >
                  <X size={16} />
                </button>
              </div>
              <Button variant="primary" onClick={continueDraft} className="mt-3 w-full">
                <Play size={16} /> Jatka treeniä
              </Button>
            </Card>
          )}

          <button
            onClick={() => startWorkout()}
            className="active:scale-[0.98] flex w-full items-center justify-center gap-2 rounded-row border border-white/10 bg-[rgba(9,11,20,0.48)] py-4 font-mono text-[13px] uppercase tracking-[0.06em] text-text transition-transform [backdrop-filter:blur(14px)]"
          >
            <Plus size={18} /> Aloita tyhjästä
          </button>

          <div className="mt-3">
            <div className={sectionLabel}>Aloita pohjasta</div>
            <div className="grid grid-cols-2 gap-3">
              {KINDS.map((k) => {
                const count = templates.filter((t) => templateKind(t) === k.id).length
                return (
                  <button
                    key={k.id}
                    onClick={() => setPicking(k.id)}
                    className="active:scale-[0.97] flex min-h-[104px] flex-col justify-between rounded-tile border border-white/10 bg-[rgba(9,11,20,0.48)] p-4 text-left transition-transform [backdrop-filter:blur(14px)]"
                  >
                    <k.Icon size={20} className="text-cyan" />
                    <div>
                      <div className="font-display text-[15px] font-semibold leading-tight text-text">{k.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                        {count} {count === 1 ? 'pohja' : 'pohjaa'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="flex flex-col gap-4">
          <button
            onClick={() => { setEditing(null); setScreen('editTemplate') }}
            className="active:scale-[0.98] flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.16] py-4 font-mono text-[13px] uppercase tracking-[0.06em] text-fg-muted transition-transform"
          >
            <Plus size={18} /> Uusi pohja
          </button>

          {KINDS.map((k) => {
            const group = templates.filter((t) => templateKind(t) === k.id)
            return (
              <div key={k.id}>
                <div className={sectionLabel}>{k.label}</div>
                {group.length === 0 ? (
                  <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-4 text-center text-[12px] text-fg-faint">
                    Ei pohjia tässä kategoriassa.
                  </p>
                ) : (
                  <TemplateGroup
                    group={group}
                    onOpen={(t) => { setEditing(t); setScreen('editTemplate') }}
                    onDelete={handleDeleteTemplate}
                    onReorder={(ids) => handleReorderTemplates(k.id, ids)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'calendar' && (() => {
        const first = new Date(calMonth.y, calMonth.m, 1)
        const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
        const byDate = new Map<string, Workout[]>()
        for (const w of workouts) {
          const arr = byDate.get(w.date) ?? []
          arr.push(w)
          byDate.set(w.date, arr)
        }
        const cells: (string | null)[] = []
        const mondayOffset = (first.getDay() + 6) % 7
        for (let i = 0; i < mondayOffset; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(new Date(calMonth.y, calMonth.m, d)))
        const monthLabel = first.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })
        const dayWorkouts = byDate.get(selectedDay) ?? []
        const shiftMonth = (delta: number) => {
          const d = new Date(calMonth.y, calMonth.m + delta, 1)
          setCalMonth({ y: d.getFullYear(), m: d.getMonth() })
        }

        return (
          <div>
            {/* Current / next block */}
            <section className="mb-4">
              <div className={sectionLabel}>Treeniblokit</div>
              {status.current ? (
                <div
                  className="rounded-row border p-4"
                  style={{ borderColor: `${status.current.color}59`, backgroundColor: `${status.current.color}14` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 truncate font-display text-[15px] font-semibold text-text">
                      {status.current.name}
                    </div>
                    <div
                      className="flex-shrink-0 font-mono text-[12px] tabular-nums"
                      style={{ color: status.current.color }}
                    >
                      {status.daysLeft} pv jäljellä
                    </div>
                  </div>
                  {status.current.note && (
                    <div className="mt-0.5 text-[12px] text-fg-muted">{status.current.note}</div>
                  )}
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-[3px] bg-black/40">
                    <div
                      className="h-full rounded-[3px] transition-[width] duration-500"
                      style={{ width: `${Math.round((status.progress ?? 0) * 100)}%`, backgroundColor: status.current.color }}
                    />
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] text-fg-faint">
                    {fromISO(status.current.startDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {fromISO(status.current.endDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })}
                  </div>
                  {status.endingSoon && (
                    <p role="status" className="mt-2 text-[12px] leading-relaxed text-accent">
                      Blokki päättyy pian — suunnittele seuraava.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-4 text-center text-[12px] leading-relaxed text-fg-faint">
                  Ei blokkia käynnissä tänään.
                </p>
              )}

              {status.next && (
                <div className="mt-2 flex items-center gap-2.5 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-2.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: status.next.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{status.next.name}</span>
                  <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-fg-muted">
                    {status.daysToNext === 0 ? 'huomenna' : `${status.daysToNext} pv päästä`}
                  </span>
                </div>
              )}

              {/* Reminder opt-in */}
              {status.current && notifyState !== 'granted' && notifyState !== 'unsupported' && (
                <button
                  onClick={async () => setNotifyState(await requestNotifyPermission())}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.16] py-3 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-muted"
                >
                  <Bell size={14} /> Muistuta {BLOCK_ENDING_SOON_DAYS} pv ennen loppua
                </button>
              )}
              {notifyState === 'granted' && (
                <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-fg-faint">
                  <Bell size={12} className="mt-0.5 flex-shrink-0 text-accent" />
                  Muistutus päällä. iOS ei salli verkkosovelluksen ajastaa ilmoituksia suljettuna,
                  joten se näytetään kerran päivässä kun avaat appin.
                </p>
              )}
              {notifyState === 'denied' && (
                <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-fg-faint">
                  <BellOff size={12} className="mt-0.5 flex-shrink-0" />
                  Ilmoitukset estetty. Salli ne Asetukset → Friday → Ilmoitukset.
                </p>
              )}

              {/* Block list */}
              <div className="mt-3 flex flex-col gap-1.5">
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setEditingBlock({ block: b, isNew: false })}
                    className="flex items-center gap-2.5 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-3.5 py-2.5 text-left"
                  >
                    <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{b.name}</span>
                    <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
                      {fromISO(b.startDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                      –
                      {fromISO(b.endDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                    </span>
                    <ChevronRight size={15} className="flex-shrink-0 text-fg-faint" />
                  </button>
                ))}
                <button
                  onClick={() => setEditingBlock({
                    block: newBlock(status.current ? addDays(status.current.endDate, 1) : selectedDay),
                    isNew: true,
                  })}
                  className="flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.16] py-3 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-muted"
                >
                  <Layers size={14} /> Uusi blokki
                </button>
              </div>
            </section>

            {/* Month header */}
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Edellinen kuukausi"
                className="icon-btn hit-44 flex !min-h-0 !min-w-0 items-center justify-center rounded-full p-2 text-fg-muted"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="font-display text-[15px] font-semibold capitalize text-text">{monthLabel}</div>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Seuraava kuukausi"
                className="icon-btn hit-44 flex !min-h-0 !min-w-0 items-center justify-center rounded-full p-2 text-fg-muted"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekday labels */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((d) => (
                <div key={d} className="py-1 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-fg-dim">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`e${i}`} className="aspect-square" />
                const has = byDate.has(date)
                const isSelected = date === selectedDay
                const isToday = date === todayISO
                const dayBlock = blockForDate(blocks, date)
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDay(date)}
                    style={
                      dayBlock && !isSelected
                        ? { backgroundColor: `${dayBlock.color}26`, borderColor: `${dayBlock.color}59` }
                        : undefined
                    }
                    aria-pressed={isSelected}
                    aria-label={`${fromISO(date).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })}${
                      has ? ` — ${(byDate.get(date) ?? []).length} treeni${(byDate.get(date) ?? []).length > 1 ? 'ä' : ''}` : ' — ei treenejä'
                    }`}
                    className={`relative flex aspect-square !min-h-0 !min-w-0 flex-col items-center justify-center rounded-xl border text-[13px] tabular-nums transition-colors ${
                      isSelected
                        ? 'border-cyan/50 bg-cyan/[0.12] font-bold text-cyan'
                        : isToday
                          ? 'border-white/25 bg-black/30 font-bold text-text'
                          : 'border-white/[0.08] bg-black/25 text-fg-muted'
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                    {has && (
                      <span className="absolute bottom-1 flex gap-0.5">
                        {(byDate.get(date) ?? []).slice(0, 3).map((w) => (
                          <span
                            key={w.id}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: w.color ?? DEFAULT_TEMPLATE_COLOR }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day's workouts */}
            <div className="mt-4">
              <div className={sectionLabel}>
                {fromISO(selectedDay).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {dayWorkouts.length === 0 ? (
                <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-5 text-center text-[12px] leading-relaxed text-fg-faint">
                  Ei treenejä tänä päivänä.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayWorkouts.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setViewing(w); setScreen('summary') }}
                      className="active:scale-[0.99] flex items-center gap-3 rounded-row border px-4 py-3 text-left transition-transform [backdrop-filter:blur(14px)]"
                      style={{
                        borderColor: `${w.color ?? DEFAULT_TEMPLATE_COLOR}44`,
                        backgroundColor: `${w.color ?? DEFAULT_TEMPLATE_COLOR}12`,
                      }}
                    >
                      <Dumbbell size={16} className="flex-shrink-0" style={{ color: w.color ?? DEFAULT_TEMPLATE_COLOR }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[14px] font-semibold text-text">{w.name}</div>
                        <div className="font-mono text-[10px] text-fg-faint">
                          {w.exercises.length} liikettä · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sarjaa
                        </div>
                      </div>
                      <ChevronRight size={16} className="flex-shrink-0 text-fg-faint" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Template picker for the chosen category */}
      {picking && (() => {
        const kind = KINDS.find((k) => k.id === picking)!
        const group = templates.filter((t) => templateKind(t) === picking)
        return (
          <Sheet
            open
            onClose={() => setPicking(null)}
            title={<><kind.Icon size={14} /> {kind.label}</>}
          >
            {group.length === 0 ? (
              <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-5 text-center text-[12px] leading-relaxed text-fg-faint">
                Ei pohjia tässä kategoriassa. Luo pohja Pohjat-välilehdellä.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {group.map((t) => {
                  const c = templateColor(t)
                  return (
                    <button
                      key={t.id}
                      onClick={() => startWorkout(t)}
                      className="active:scale-[0.97] relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-tile border p-4 text-left transition-transform"
                      style={{ borderColor: `${c}55`, backgroundColor: `${c}14` }}
                    >
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c }} />
                      <Play size={17} style={{ color: c }} />
                      <div>
                        <div className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-text">
                          {t.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                          {t.exercises.length} liikettä
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Sheet>
        )
      })()}

      {/* Block editor */}
      {editingBlock && (
        <BlockEditorSheet
          block={editingBlock.block}
          all={blocks}
          isNew={editingBlock.isNew}
          onSave={handleSaveBlock}
          onDelete={() => handleDeleteBlock(editingBlock.block.id)}
          onClose={() => setEditingBlock(null)}
        />
      )}

      <WarmupFab />
    </div>
  )
}
