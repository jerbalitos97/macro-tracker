import { useEffect, useRef, useState } from 'react'
import { Plus, Dumbbell, ClipboardList, CalendarDays, Play, Trash2, X, ChevronRight, ChevronLeft, Timer } from 'lucide-react'
import { Card, Button, Sheet } from '../components/ui'
import { TemplateEditor } from '../components/workout/TemplateEditor'
import { WarmupFab } from '../components/workout/WarmupSheet'
import { WorkoutLogger } from '../components/workout/WorkoutLogger'
import { WorkoutSummary } from '../components/workout/WorkoutSummary'
import { WorkoutSuccess } from '../components/workout/WorkoutSuccess'
import { toISO, fromISO } from '../lib/dates'
import { useAuth } from '../contexts/AuthContext'
import {
  getTemplates, saveTemplate, deleteTemplate,
  pullTemplates, syncTemplateCloud, deleteTemplateCloud,
  getWorkouts, saveWorkout, deleteWorkout,
  pullWorkouts, syncWorkoutCloud, deleteWorkoutCloud,
  getDraft, saveDraft, clearDraft, newWorkout,
} from '../lib/workouts'
import { DEFAULT_TEMPLATE_COLOR } from '../lib/workouts'
import type { Workout, WorkoutTemplate, TemplateKind } from '../lib/workouts'

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

  // Refresh templates and history from the cloud when logged in.
  useEffect(() => {
    if (!user) return
    let alive = true
    pullTemplates(user.id).then((ts) => { if (alive) setTemplates(ts) })
    pullWorkouts(user.id).then((ws) => { if (alive) setWorkouts(ws) })
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

  // ── Templates ────────────────────────────────────────────────────
  const handleSaveTemplate = (t: WorkoutTemplate) => {
    setTemplates(saveTemplate(t))
    if (user) syncTemplateCloud(user.id, t)
    setEditing(null)
    setScreen('home')
    setTab('templates')
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
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-row border border-white/10 bg-white/[0.04] p-1">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
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
            className="active:scale-[0.98] flex w-full items-center justify-center gap-2 rounded-row border border-white/10 bg-white/[0.05] py-4 font-mono text-[13px] uppercase tracking-[0.06em] text-text transition-transform [backdrop-filter:blur(14px)]"
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
                    className="active:scale-[0.97] flex min-h-[104px] flex-col justify-between rounded-tile border border-white/10 bg-white/[0.05] p-4 text-left transition-transform [backdrop-filter:blur(14px)]"
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
                  <div className="grid grid-cols-2 gap-3">
                    {group.map((t) => {
                      const c = templateColor(t)
                      return (
                        <div
                          key={t.id}
                          onClick={() => { setEditing(t); setScreen('editTemplate') }}
                          className="active:scale-[0.97] relative flex min-h-[104px] cursor-pointer flex-col justify-between overflow-hidden rounded-tile border p-4 transition-transform [backdrop-filter:blur(14px)]"
                          style={{ borderColor: `${c}55`, backgroundColor: `${c}14` }}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-1"
                            style={{ backgroundColor: c }}
                          />
                          <div className="flex items-start justify-between gap-1">
                            <ClipboardList size={17} style={{ color: c }} />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                              aria-label="Poista pohja"
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
                        </div>
                      )
                    })}
                  </div>
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
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDay(date)}
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

      <WarmupFab />
    </div>
  )
}
