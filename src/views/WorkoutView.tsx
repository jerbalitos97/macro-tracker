import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Dumbbell, ClipboardList, CalendarDays, Play, Trash2, ChevronRight, ChevronLeft, Timer, Layers, Bell, BellOff, GripVertical, Archive, RotateCcw } from 'lucide-react'
import { Button, Sheet, DragItem, useDragReorder, moveById, moveByDelta, snack } from '../components/ui'
import { TemplateEditor } from '../components/workout/TemplateEditor'
import { WorkoutTools } from '../components/workout/WorkoutTools'
import { DailyCheckSheet } from '../components/workout/DailyCheckSheet'
import { deriveRegionHistory, assessmentsFrom, ALL_REGIONS } from '../lib/gates'
import type { BodyRegion, GateStates, RegionHistory, LoadDay } from '../lib/gates'
import {
  getLastLocationId, setLastLocationId, locationById, getLocations, pullLocations,
  syncLocationCloud,
} from '../lib/locations'
import type { TrainingLocation } from '../lib/locations'
import { resolveExercises, reresolveExercise } from '../lib/sessionResolve'
import { pullWarmups } from '../lib/warmups'
import { WorkoutLogger } from '../components/workout/WorkoutLogger'
import { WorkoutSummary } from '../components/workout/WorkoutSummary'
import { WorkoutSuccess } from '../components/workout/WorkoutSuccess'
import { toISO, fromISO } from '../lib/dates'
import type { Settings, TrainingBurn } from '../types'
import { computeLoggableBurn } from '../lib/energy'
import { useAuth } from '../contexts/AuthContext'
import {
  getTemplates, archivedTemplates, setArchived, saveTemplate, deleteTemplate, reorderTemplates,
  templateInPlay, upcomingTemplates, supersededByBlock,
  pullTemplates, syncTemplateCloud, deleteTemplateCloud,
  getWorkouts, saveWorkout, deleteWorkout,
  pullWorkouts, syncWorkoutCloud, deleteWorkoutCloud,
  getDrafts, saveDraft, clearDraft, newWorkout, lastEntryForExercise,
} from '../lib/workouts'
import { DEFAULT_TEMPLATE_COLOR } from '../lib/workouts'
import { getPrefs, savePrefsLocal, syncPrefsCloud } from '../lib/uiPrefs'
import type { Workout, WorkoutTemplate, TemplateKind } from '../lib/workouts'
import {
  getBlocks, pullBlocks,
  blockForDate, blockStatus, BLOCK_ENDING_SOON_DAYS,
} from '../lib/blocks'
import type { TrainingBlock } from '../lib/blocks'
import {
  notifyPermission, requestNotifyPermission, maybeNotifyBlockEnding,
} from '../lib/blockNotify'
import type { NotifyPermission } from '../lib/blockNotify'

type Tab = 'log' | 'templates' | 'calendar'
type Screen = 'home' | 'logging' | 'summary' | 'editTemplate'

const TABS: Array<{ id: Tab; label: string; Icon: typeof Dumbbell }> = [
  { id: 'log',       label: 'Treeni',    Icon: Dumbbell },
  { id: 'templates', label: 'Pohjat',    Icon: ClipboardList },
  { id: 'calendar',  label: 'Kalenteri', Icon: CalendarDays },
]

const sectionLabel = 'mb-2 px-1 text-[16px] font-medium leading-6 text-text'

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
            className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-[24px] border border-white/[0.08] bg-[var(--surface-1)] p-[14px] pl-[18px]"
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
                    <Trash2 size={16} />
                  </button>
                </div>
                <div>
                  <div className="line-clamp-2 text-[16px] font-medium leading-6 text-text">
                    {t.name}
                  </div>
                  <div className="text-[12px] leading-4 text-fg-muted">
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

interface Props {
  settings: Settings
  /** Burns already recorded, so a session is never counted twice. */
  burns: TrainingBurn[]
  /** Latest smoothed body weight; without it no estimate can be made. */
  bodyWeightKg: number | null
  onAddBurn: (burn: { kcal: number; note: string }, date: string) => void
}

export function WorkoutView({ settings, burns, bodyWeightKg, onAddBurn }: Props) {
  const todayISO = toISO(new Date())
  const { user } = useAuth()

  const [screen, setScreen] = useState<Screen>('home')
  const [tab, setTab] = useState<Tab>('log')

  const [templates, setTemplates] = useState<WorkoutTemplate[]>(() => getTemplates())
  const [workouts, setWorkouts] = useState<Workout[]>(() => getWorkouts())
  const [drafts, setDrafts] = useState<Workout[]>(() => getDrafts())

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
  const [locations, setLocations] = useState<TrainingLocation[]>(() => getLocations())
  // Warm-up packages are read through warmupById at render time, so the pull
  // only needs to force one re-render rather than be held in state.
  const [, setWarmupTick] = useState(0)
  // The gate flow lives between picking a template and logging: a session is
  // never created until the room and the body have both been resolved.
  const [pendingTemplate, setPendingTemplate] = useState<WorkoutTemplate | null | undefined>(undefined)
  const [editCheck, setEditCheck] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [notifyState, setNotifyState] = useState<NotifyPermission>(() => notifyPermission())

  // Refresh templates and history from the cloud when logged in.
  useEffect(() => {
    if (!user) return
    let alive = true
    pullTemplates(user.id).then((ts) => { if (alive) setTemplates(ts) })
    pullWorkouts(user.id).then((ws) => { if (alive) setWorkouts(ws) })
    pullBlocks(user.id).then((bs) => { if (alive) setBlocks(bs) })
    // Locations and warm-up packages are content, not code: they live in the
    // database and arrive here, so a fresh install has none until this resolves.
    pullLocations(user.id).then((ls) => { if (alive) setLocations(ls) })
    pullWarmups(user.id).then(() => { if (alive) setWarmupTick((n) => n + 1) })
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
      setDrafts(saveDraft(session))
    }
  }, [session, screen, pastEdit, user])

  // ── Session lifecycle ────────────────────────────────────────────
  // Every past assessment, and the days that loaded each region — the two
  // inputs the gates derive baseline, trend and 24h response from.
  const assessmentLog = useMemo(
    () => workouts.flatMap((w) => w.assessments ?? []),
    [workouts],
  )
  const loadDays: LoadDay[] = useMemo(
    () =>
      workouts
        .filter((w) => w.completed)
        .map((w) => {
          const regions = [
            ...new Set(
              w.exercises
                .map((e) => e.resolution?.gateRegion)
                .filter((r): r is BodyRegion => Boolean(r)),
            ),
          ]
          // Sessions logged before gates existed have no region marks; treating
          // them as loading everything is closer to the truth than treating
          // them as loading nothing.
          return { date: w.date, regions: regions.length > 0 ? regions : ('all' as const) }
        }),
    [workouts],
  )
  const histories = useMemo(() => {
    const out = {} as Record<BodyRegion, RegionHistory>
    for (const r of ALL_REGIONS) out[r] = deriveRegionHistory(assessmentLog, r, todayISO, loadDays)
    return out
  }, [assessmentLog, todayISO, loadDays])

  /** A place invented in the daily check is real data, so it goes up with
   *  everything else rather than living only on this phone. */
  const saveLocationEverywhere = (saved: TrainingLocation, all: TrainingLocation[]) => {
    setLocations(all)
    if (user) syncLocationCloud(user.id, saved)
  }

  /** Step one: choose the template, then ask the day. */
  const startWorkout = (template?: WorkoutTemplate) => {
    setPicking(null)
    setPendingTemplate(template ?? null)
  }

  /** Step two: the room and the body are known, so the session can be built. */
  const beginResolved = (
    template: WorkoutTemplate | null,
    location: TrainingLocation | null,
    gates: GateStates,
    redFlags: Parameters<typeof assessmentsFrom>[2],
  ) => {
    const base = newWorkout(todayISO, template ?? undefined)
    const w: Workout = {
      ...base,
      locationId: location?.id,
      assessments: assessmentsFrom(gates, todayISO, redFlags),
      exercises: template
        ? resolveExercises({
            template,
            location,
            gates,
            lastSetsFor: (name) => lastEntryForExercise(name)?.sets ?? null,
          })
        : base.exercises,
    }
    if (location) setLastLocationId(location.id)
    setPendingTemplate(undefined)
    setSession(w)
    setDrafts(saveDraft(w))
    setScreen('logging')
  }

  const continueDraft = (d: Workout) => {
    setSession(d)
    setScreen('logging')
  }

  // Act now, undo from the snackbar: the draft is a local record, so putting
  // it back is the same saveDraft the autosave uses.
  const discardDraft = (d: Workout) => {
    setDrafts(clearDraft(d.id))
    if (session?.id === d.id) setSession(null)
    snack({ text: `Hylätty: ${d.name}`, onAction: () => setDrafts(saveDraft(d)) })
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
    setDrafts(clearDraft(saved.id))
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
  const currentBlockId = status.current?.id ?? null
  const upcoming = upcomingTemplates(templates, currentBlockId)

  // Kun blokin oma ohjelma astuu voimaan, edelliset pohjat jäävät roikkumaan
  // valikkoon. Kysytään kerran per blokki eikä arkistoida itse: pohjien
  // eläköittäminen on ohjelmapäätös, ja kalenterin vaihtuminen on huono syy
  // tehdä se kenenkään puolesta.
  const superseded = currentBlockId
    ? supersededByBlock(templates, currentBlockId)
    : []
  const blockHasOwn = currentBlockId
    ? templates.some((t) => !t.archivedAt && t.blockId === currentBlockId)
    : false
  const askArchive =
    blockHasOwn && superseded.length > 0 && getPrefs().blockTemplateAck !== currentBlockId
  const [archivePrompt, setArchivePrompt] = useState(true)

  const answerArchive = (archive: boolean) => {
    if (archive) {
      let next = templates
      for (const t of superseded) next = setArchived(t.id, true)
      setTemplates(next)
      if (user) {
        for (const t of next) if (superseded.some((s) => s.id === t.id)) syncTemplateCloud(user.id, t)
      }
    }
    const prefs = savePrefsLocal({ ...getPrefs(), blockTemplateAck: currentBlockId ?? undefined })
    if (user) syncPrefsCloud(user.id, prefs)
    setArchivePrompt(false)
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

  // Act now, undo from the snackbar. Restoring is the ordinary save + upsert,
  // so the row comes back whole with its id, position and block binding.
  const handleDeleteTemplate = (id: string) => {
    const removed = templates.find((t) => t.id === id)
    setTemplates(deleteTemplate(id))
    if (user) deleteTemplateCloud(user.id, id)
    if (!removed) return
    snack({
      text: `Pohja poistettu: ${removed.name}`,
      onAction: () => {
        setTemplates(saveTemplate(removed))
        if (user) syncTemplateCloud(user.id, removed)
      },
    })
  }

  // ── Sub-screens ──────────────────────────────────────────────────
  if (screen === 'logging' && session) {
    return (
      <>
        <WorkoutLogger
          workout={session}
          template={templates.find((t) => t.id === session.templateId) ?? null}
          onChange={setSession}
          onFinish={finishWorkout}
          onSwapVariant={(exerciseId, state) => {
            const tpl = templates.find((t) => t.id === session.templateId)
            const target = session.exercises.find((e) => e.id === exerciseId)
            // slotId first: two slots can share a name ("Step downs"), and a
            // name match would then swap the wrong one.
            const te =
              tpl?.exercises.find((x) => x.id === target?.resolution?.slotId) ??
              tpl?.exercises.find((x) => x.name === target?.resolution?.baseName)
            if (!te) return
            const rebuilt = reresolveExercise(te, locationById(session.locationId), state)
            const next: Workout = {
              ...session,
              exercises: session.exercises.map((e) => (e.id === exerciseId ? { ...rebuilt, id: e.id } : e)),
              updatedAt: new Date().toISOString(),
            }
            setSession(next)
            setDrafts(saveDraft(next))
          }}
          onExit={exitLogging}
        />
        <WorkoutTools
          workoutId={session?.id ?? drafts[0]?.id}
          onEditCheck={session ? () => setEditCheck(true) : undefined}
        />
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
          burn={
            bodyWeightKg
              ? computeLoggableBurn({
                  workout: viewing,
                  sameDayWorkouts: workouts.filter((w) => w.date === viewing.date),
                  settings,
                  burns,
                  body: {
                    weightKg: bodyWeightKg,
                    heightCm: settings.heightCm,
                    age: settings.birthYear
                      ? new Date().getFullYear() - settings.birthYear
                      : undefined,
                    sex: settings.sex,
                  },
                })
              : null
          }
          onLogBurn={(kcal) => onAddBurn({ kcal, note: viewing.name || 'Treeni' }, viewing.date)}
          onDelete={(id) => {
            // Act now, undo from the snackbar: the record is put back whole
            // through the same save + upsert a finished session uses.
            const removed = workouts.find((w) => w.id === id) ?? viewing
            setWorkouts(deleteWorkout(id))
            if (user) deleteWorkoutCloud(user.id, id)
            snack({
              text: 'Treeni poistettu',
              onAction: () => {
                setWorkouts(saveWorkout(removed))
                if (user) syncWorkoutCloud(user.id, removed)
              },
            })
          }}
          onEdit={() => startEditPast(viewing)}
          onClose={() => { setViewing(null); setScreen('home'); setTab('calendar') }}
        />
        <WorkoutTools
          workoutId={session?.id ?? drafts[0]?.id}
          onEditCheck={session ? () => setEditCheck(true) : undefined}
        />
      </>
    )
  }

  if (screen === 'editTemplate') {
    return (
      <>
        <TemplateEditor
          initial={editing ?? undefined}
          blocks={blocks}
          onSave={handleSaveTemplate}
          onCancel={() => { setEditing(null); setScreen('home') }}
        />
        <WorkoutTools
          workoutId={session?.id ?? drafts[0]?.id}
          onEditCheck={session ? () => setEditCheck(true) : undefined}
        />
      </>
    )
  }

  // ── Home (3 tabs) ────────────────────────────────────────────────
  // "Seuraavaksi" hero: a display suggestion only, read from what is already
  // loaded. Among the templates offered today (strength first, since that is
  // what a block programmes), the one done longest ago — never-done ones first,
  // ties kept in the user's own order. Nothing is stored; an empty template
  // list (not synced yet) simply means no hero.
  const offered = templates.filter((t) => templateInPlay(t, currentBlockId))
  const heroPool = offered.some((t) => templateKind(t) === 'strength')
    ? offered.filter((t) => templateKind(t) === 'strength')
    : offered
  const lastDoneById = new Map<string, string>()
  for (const w of workouts) {
    if (w.completed && w.templateId && !lastDoneById.has(w.templateId)) lastDoneById.set(w.templateId, w.date)
  }
  const nextTemplate = heroPool.length
    ? [...heroPool].sort((a, b) => (lastDoneById.get(a.id) ?? '').localeCompare(lastDoneById.get(b.id) ?? ''))[0]
    : null
  const nextLast = nextTemplate ? lastDoneById.get(nextTemplate.id) : undefined
  const blockWeek = status.current
    ? Math.floor((fromISO(todayISO).getTime() - fromISO(status.current.startDate).getTime()) / (7 * 86400000)) + 1
    : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-2">
      {/* Segmented tabs */}
      <div
        role="tablist"
        aria-label="Workout-näkymät"
        className="flex gap-1 rounded-[24px] border border-white/[0.08] bg-[var(--surface-2)] p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex min-h-10 flex-1 items-center justify-center rounded-[20px] text-[14px] font-medium transition-colors ${
                active ? 'bg-cyan/[0.18] text-[#a5f3fc]' : 'text-fg-muted'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'log' && (
        <div className="flex flex-col gap-3">
          {drafts.length === 0 && nextTemplate && (
            <section
              className="flex flex-col gap-2 rounded-[36px_36px_36px_12px] border border-[rgba(96,165,250,0.4)] p-[22px]"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.34), rgba(34,211,238,0.22))' }}
            >
              <span className="text-[14px] leading-5 text-[#dbeafe]">
                Seuraavaksi{status.current ? ` · ${status.current.name}, viikko ${blockWeek}` : ''}
              </span>
              <span
                className="break-words text-[40px] font-[250] leading-[44px] tracking-[-0.03em] text-text"
                style={{ fontVariationSettings: "'opsz' 144, 'wdth' 110" }}
              >
                {nextTemplate.name}
              </span>
              <span className="text-[15px] text-[#dbeafe]">
                {nextTemplate.exercises.length} liikettä
                {' · '}
                {nextLast
                  ? `viimeksi ${fromISO(nextLast).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}`
                  : 'ei vielä tehty'}
              </span>
              <Button variant="primary" onClick={() => startWorkout(nextTemplate)} className="mt-1.5 w-full">
                Aloita treeni
              </Button>
            </section>
          )}

          {/* Every unfinished session, not just the last one. A mobility
              routine started in the morning and a strength session in the
              evening genuinely overlap, and making one of them be finished or
              thrown away to start the other loses real work. */}
          {drafts.map((d) => (
            <div key={d.id} className="flex flex-col gap-2.5 rounded-[24px] border border-[rgba(242,210,155,0.4)] bg-[var(--surface-1)] p-4">
              <span className="text-[12px] leading-4 text-[#F2D29B]">Kesken</span>
              <span className="truncate text-[18px] font-medium text-text">{d.name}</span>
              <span className="text-[14px] leading-5 text-fg-muted">
                {d.exercises.length} liikettä
                {d.date !== todayISO && ` · ${fromISO(d.date).toLocaleDateString('fi-FI')}`}
              </span>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => continueDraft(d)}>
                  Jatka treeniä
                </Button>
                <Button variant="ghost" onClick={() => discardDraft(d)} aria-label={`Hylkää ${d.name}`}>
                  Hylkää
                </Button>
              </div>
            </div>
          ))}

          <Button variant="ghost" onClick={() => startWorkout()} className="w-full border-dashed">
            <Plus size={18} /> Aloita tyhjästä
          </Button>

          <div>
            <h2 className="mb-2 px-1 pt-1 text-[16px] font-medium leading-6 text-text">Tai valitse pohja</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {KINDS.map((k) => {
                const count = templates.filter(
                  (t) => templateKind(t) === k.id && templateInPlay(t, currentBlockId),
                ).length
                return (
                  <button
                    key={k.id}
                    onClick={() => setPicking(k.id)}
                    className="flex min-h-[116px] flex-col justify-between gap-2 rounded-[24px] border border-white/[0.08] bg-[var(--surface-1)] p-[14px] text-left"
                  >
                    <k.Icon size={22} className="text-cyan" />
                    <span className="flex flex-col">
                      <span className="text-[16px] font-medium leading-6 text-text">{k.label}</span>
                      <span className="text-[12px] leading-4 text-fg-muted">
                        {count} {count === 1 ? 'pohja' : 'pohjaa'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="flex flex-col gap-4">
          <Button variant="primary" onClick={() => { setEditing(null); setScreen('editTemplate') }} className="w-full">
            <Plus size={18} /> Uusi pohja
          </Button>

          {KINDS.map((k) => {
            const group = templates.filter((t) => templateKind(t) === k.id && templateInPlay(t, currentBlockId))
            const tulossa = upcoming.filter((t) => templateKind(t) === k.id)
            return (
              <div key={k.id}>
                <div className={sectionLabel}>{k.label}</div>
                {group.length === 0 ? (
                  <p className="rounded-[20px] border border-dashed border-white/[0.12] px-4 py-4 text-center text-[14px] leading-5 text-fg-muted">
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

                {/* Seuraavan blokin ohjelma. Näkyvissä ja muokattavissa, muttei
                    tarjolla — pohja jota ei näe on pohja jota ei ehdi korjata. */}
                {tulossa.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 px-1 text-[12px] leading-4 text-fg-muted">
                      Tulossa käyttöön
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {tulossa.map((t) => {
                        const b = blocks.find((x) => x.id === t.blockId)
                        return (
                          <button
                            key={t.id}
                            onClick={() => { setEditing(t); setScreen('editTemplate') }}
                            className="relative flex min-h-[92px] flex-col justify-between overflow-hidden rounded-[24px] border border-dashed border-white/[0.16] bg-[var(--surface-1)] p-4 text-left opacity-80"
                          >
                            <Layers size={16} className="text-fg-faint" />
                            <div>
                              <div className="line-clamp-2 text-[14px] font-medium leading-5 text-fg-muted">
                                {t.name}
                              </div>
                              <div className="mt-0.5 text-[12px] leading-4 text-fg-muted">
                                {b ? `${b.name} · ${fromISO(b.startDate).toLocaleDateString('fi-FI')}` : 'ei blokkia'}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <button
            onClick={() => setShowArchive(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[0.18] text-[14px] font-medium text-text"
          >
            <Archive size={14} /> Arkisto ({archivedTemplates().length})
          </button>
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
                  className="rounded-[24px] border border-white/[0.08] bg-[var(--surface-1)] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 truncate text-[18px] font-medium text-text">
                      {status.current.name}
                    </div>
                    <div
                      className="flex-shrink-0 font-mono text-[12px] tabular-nums text-fg-muted"
                      style={{ color: status.current.color }}
                    >
                      {status.daysLeft} pv jäljellä
                    </div>
                  </div>
                  {status.current.note && (
                    <div className="mt-0.5 text-[14px] leading-5 text-fg-muted">{status.current.note}</div>
                  )}
                  <div className="mt-2.5 h-2 overflow-hidden rounded-[4px] bg-white/[0.12]">
                    <div
                      className="h-full rounded-[3px] transition-[width] duration-500"
                      style={{ width: `${Math.round((status.progress ?? 0) * 100)}%`, backgroundColor: status.current.color }}
                    />
                  </div>
                  <div className="mt-1.5 text-[14px] leading-5 text-fg-muted">
                    {fromISO(status.current.startDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {fromISO(status.current.endDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })}
                  </div>
                  {status.endingSoon && (
                    <p role="status" className="mt-2 text-[14px] leading-5 text-accent">
                      Blokki päättyy pian — suunnittele seuraava.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-[20px] border border-dashed border-white/[0.12] px-4 py-4 text-center text-[14px] leading-5 text-fg-muted">
                  Ei blokkia käynnissä tänään.
                </p>
              )}

              {status.next && (
                <div className="mt-2 flex min-h-14 items-center gap-3 rounded-[20px] bg-[var(--surface-1)] px-4 py-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: status.next.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-text">{status.next.name}</span>
                  <span className="flex-shrink-0 font-mono text-[14px] tabular-nums text-fg-muted">
                    {status.daysToNext === 0 ? 'huomenna' : `${status.daysToNext} pv päästä`}
                  </span>
                </div>
              )}

              {/* Reminder opt-in */}
              {status.current && notifyState !== 'granted' && notifyState !== 'unsupported' && (
                <button
                  onClick={async () => setNotifyState(await requestNotifyPermission())}
                  className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-cyan/[0.16] text-[14px] font-medium text-[#cde7ec]"
                >
                  <Bell size={14} /> Muistuta {BLOCK_ENDING_SOON_DAYS} pv ennen loppua
                </button>
              )}
              {notifyState === 'granted' && (
                <p className="mt-2 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-fg-muted">
                  <Bell size={12} className="mt-0.5 flex-shrink-0 text-accent" />
                  Muistutus päällä. iOS ei salli verkkosovelluksen ajastaa ilmoituksia suljettuna,
                  joten se näytetään kerran päivässä kun avaat appin.
                </p>
              )}
              {notifyState === 'denied' && (
                <p className="mt-2 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-fg-muted">
                  <BellOff size={12} className="mt-0.5 flex-shrink-0" />
                  Ilmoitukset estetty. Salli ne Asetukset → Friday → Ilmoitukset.
                </p>
              )}

              {/* Block list — read-only here. This calendar records what was
                  done; blocks are planned in Suunnittelu, against the
                  nutrition periods they have to coexist with. */}
              <div className="mt-3 flex flex-col gap-1.5">
                {blocks.length > 0 && (
                <div className="flex flex-col gap-[2px] overflow-hidden rounded-[20px]">
                {blocks.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-h-14 items-center gap-3 bg-[var(--surface-1)] px-4 py-2"
                  >
                    <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-text">{b.name}</span>
                    <span className="flex-shrink-0 font-mono text-[14px] tabular-nums text-fg-muted">
                      {fromISO(b.startDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                      –
                      {fromISO(b.endDate).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}
                    </span>
                  </div>
                ))}
                </div>
                )}
                <p className="mt-1 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-fg-muted">
                  <Layers size={12} className="mt-0.5 flex-shrink-0" />
                  Blokit luodaan ja muokataan Suunnittelu-työkalussa.
                </p>
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
              <div className="text-[16px] font-medium capitalize text-text">{monthLabel}</div>
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
                <div key={d} className="py-1 text-center text-[12px] text-fg-muted">{d}</div>
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
                    className={`relative flex aspect-square !min-h-0 !min-w-0 flex-col items-center justify-center rounded-xl border font-mono text-[14px] tabular-nums transition-colors ${
                      isSelected
                        ? 'border-cyan bg-cyan/[0.12] font-semibold text-cyan'
                        : isToday
                          ? 'border-white/25 bg-[var(--surface-1)] font-semibold text-text'
                          : 'border-white/[0.08] bg-[var(--surface-1)] text-fg-muted'
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
                <p className="rounded-[20px] border border-dashed border-white/[0.12] px-4 py-5 text-center text-[14px] leading-5 text-fg-muted">
                  Ei treenejä tänä päivänä.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayWorkouts.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setViewing(w); setScreen('summary') }}
                      className="flex min-h-[72px] items-center gap-3 rounded-[24px] border border-white/[0.08] bg-[var(--surface-1)] px-4 py-3 text-left"
                    >
                      <Dumbbell size={16} className="flex-shrink-0" style={{ color: w.color ?? DEFAULT_TEMPLATE_COLOR }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-medium leading-6 text-text">{w.name}</div>
                        <div className="text-[14px] leading-5 text-fg-muted">
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
      {pendingTemplate !== undefined && (
        <DailyCheckSheet
          histories={histories}
          locations={locations}
          defaultLocationId={getLastLocationId()}
          onLocationSaved={saveLocationEverywhere}
          onCancel={() => setPendingTemplate(undefined)}
          onStart={({ location, check, gates }) =>
            beginResolved(pendingTemplate, location, gates, check.redFlags)
          }
        />
      )}

      {editCheck && session && (
        <DailyCheckSheet
          histories={histories}
          locations={locations}
          defaultLocationId={session.locationId ?? getLastLocationId()}
          onLocationSaved={saveLocationEverywhere}
          expandAll
          onCancel={() => setEditCheck(false)}
          onStart={({ location, check, gates }) => {
            // Re-resolving mid-session keeps the sets already logged for slots
            // whose variant did not change; the rest are rebuilt.
            const tpl = templates.find((t) => t.id === session.templateId) ?? null
            const next: Workout = {
              ...session,
              locationId: location?.id ?? session.locationId,
              assessments: assessmentsFrom(gates, todayISO, check.redFlags),
              exercises: tpl
                ? resolveExercises({ template: tpl, location, gates }).map((re) => {
                    const prev = session.exercises.find(
                      (e) => e.resolution?.baseName === re.resolution?.baseName,
                    )
                    const sameVariant = prev && prev.name === re.name
                    return sameVariant ? { ...re, id: prev.id, sets: prev.sets } : re
                  })
                : session.exercises,
              updatedAt: new Date().toISOString(),
            }
            setSession(next)
            setDrafts(saveDraft(next))
                    setEditCheck(false)
          }}
        />
      )}

      {showArchive && (() => {
        const arch = archivedTemplates()
        return (
          <Sheet open onClose={() => setShowArchive(false)} title={<><Archive size={14} />Arkisto</>}>
            <p className="mb-3 text-[14px] leading-5 text-fg-muted">
              Arkistoitu pohja ei näy valinnoissa, mutta siitä aloitetut treenit säilyvät
              koskemattomina — treeni on tallenne siitä mitä tehtiin, ei siitä mitä pohja sanoo.
            </p>
            {arch.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-white/[0.12] px-4 py-4 text-center text-[14px] leading-5 text-fg-muted">
                Arkisto on tyhjä.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {arch.map((t) => (
                  <div
                    key={t.id}
                    className="flex min-h-[72px] items-center gap-3 rounded-[20px] bg-[var(--surface-2)] px-4 py-2"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: t.color ?? DEFAULT_TEMPLATE_COLOR }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] leading-6 text-text">{t.name}</div>
                      <div className="text-[14px] leading-5 text-fg-muted">
                        arkistoitu {t.archivedAt ? fromISO(t.archivedAt.slice(0, 10)).toLocaleDateString('fi-FI') : '—'}
                      </div>
                    </div>
                    <Button
                      variant="action"
                      onClick={() => {
                        const next = setArchived(t.id, false)
                        setTemplates(next)
                        const restored = next.find((x) => x.id === t.id)
                        if (user && restored) syncTemplateCloud(user.id, restored)
                      }}
                    >
                      <RotateCcw size={16} /> Palauta
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Sheet>
        )
      })()}

      {askArchive && archivePrompt && status.current && (
        <Sheet
          open
          onClose={() => setArchivePrompt(false)}
          title={<><Layers size={14} /> Uusi blokki alkoi</>}
        >
          <p className="text-[14px] leading-5 text-fg-muted">
            <strong className="text-text">{status.current.name}</strong> on alkanut ja sen omat pohjat
            ovat nyt käytössä. Edelliset {superseded.length} pohjaa ovat yhä valikossa.
          </p>
          <div className="mt-2.5 flex flex-col gap-1">
            {superseded.map((t) => (
              <div key={t.id} className="truncate text-[14px] leading-5 text-fg-muted">{t.name}</div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => answerArchive(true)}>
              <Archive size={15} /> Siirrä arkistoon
            </Button>
            <Button variant="secondary" onClick={() => answerArchive(false)}>Pidä käytössä</Button>
          </div>
          <p className="mt-2.5 text-[12px] leading-4 text-fg-muted">
            Arkistointi ei poista mitään: vanhat treenit osoittavat edelleen näihin pohjiin, ja ne
            voi palauttaa arkistosta milloin tahansa. Kysytään kerran tätä blokkia kohden.
          </p>
        </Sheet>
      )}

      {picking && (() => {
        const kind = KINDS.find((k) => k.id === picking)!
        const group = templates.filter((t) => templateKind(t) === picking && templateInPlay(t, currentBlockId))
        return (
          <Sheet
            open
            onClose={() => setPicking(null)}
            title={<><kind.Icon size={14} /> {kind.label}</>}
          >
            {group.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-white/[0.12] px-4 py-5 text-center text-[14px] leading-5 text-fg-muted">
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
                      className="relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-[24px] border border-white/[0.08] bg-[var(--surface-2)] p-[14px] pl-[18px] text-left"
                    >
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c }} />
                      <Play size={17} style={{ color: c }} />
                      <div>
                        <div className="line-clamp-2 text-[16px] font-medium leading-6 text-text">
                          {t.name}
                        </div>
                        <div className="text-[12px] leading-4 text-fg-muted">
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

      <WorkoutTools
          workoutId={session?.id ?? drafts[0]?.id}
          onEditCheck={session ? () => setEditCheck(true) : undefined}
        />
    </div>
  )
}
