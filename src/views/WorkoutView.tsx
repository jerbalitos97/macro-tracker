import { useEffect, useState } from 'react'
import { Plus, Dumbbell, ClipboardList, CalendarDays, Play, Trash2, X, ChevronRight } from 'lucide-react'
import { Card, Button } from '../components/ui'
import { TemplateEditor } from '../components/workout/TemplateEditor'
import { WorkoutLogger } from '../components/workout/WorkoutLogger'
import { WorkoutSummary } from '../components/workout/WorkoutSummary'
import { WorkoutSuccess } from '../components/workout/WorkoutSuccess'
import { toISO, fromISO } from '../lib/dates'
import {
  getTemplates, saveTemplate, deleteTemplate,
  getWorkouts, saveWorkout, deleteWorkout,
  getDraft, saveDraft, clearDraft, newWorkout,
} from '../lib/workouts'
import type { Workout, WorkoutTemplate } from '../lib/workouts'

type Tab = 'log' | 'templates' | 'calendar'
type Screen = 'home' | 'logging' | 'summary' | 'editTemplate'

const TABS: Array<{ id: Tab; label: string; Icon: typeof Dumbbell }> = [
  { id: 'log',       label: 'Treeni',    Icon: Dumbbell },
  { id: 'templates', label: 'Pohjat',    Icon: ClipboardList },
  { id: 'calendar',  label: 'Kalenteri', Icon: CalendarDays },
]

const sectionLabel = 'mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim'

export function WorkoutView() {
  const todayISO = toISO(new Date())

  const [screen, setScreen] = useState<Screen>('home')
  const [tab, setTab] = useState<Tab>('log')

  const [templates, setTemplates] = useState<WorkoutTemplate[]>(() => getTemplates())
  const [workouts, setWorkouts] = useState<Workout[]>(() => getWorkouts())
  const [draft, setDraft] = useState<Workout | null>(() => getDraft())

  const [session, setSession] = useState<Workout | null>(null)
  const [viewing, setViewing] = useState<Workout | null>(null)
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null)
  const [success, setSuccess] = useState(false)

  // Autosave the in-progress draft on every change.
  useEffect(() => {
    if (screen === 'logging' && session) {
      saveDraft(session)
      setDraft(session)
    }
  }, [session, screen])

  // ── Session lifecycle ────────────────────────────────────────────
  const startWorkout = (template?: WorkoutTemplate) => {
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
    clearDraft()
    setDraft(null)
    setSession(null)
    setViewing(saved)
    setSuccess(true)
  }

  // ── Templates ────────────────────────────────────────────────────
  const handleSaveTemplate = (t: WorkoutTemplate) => {
    setTemplates(saveTemplate(t))
    setEditing(null)
    setScreen('home')
    setTab('templates')
  }

  const handleDeleteTemplate = (id: string) => {
    if (!window.confirm('Poistetaanko pohja?')) return
    setTemplates(deleteTemplate(id))
  }

  // ── Sub-screens ──────────────────────────────────────────────────
  if (screen === 'logging' && session) {
    return (
      <>
        <WorkoutLogger
          workout={session}
          onChange={setSession}
          onFinish={finishWorkout}
          onExit={() => setScreen('home')}
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
      <WorkoutSummary
        workout={viewing}
        onDelete={(id) => setWorkouts(deleteWorkout(id))}
        onClose={() => { setViewing(null); setScreen('home'); setTab('calendar') }}
      />
    )
  }

  if (screen === 'editTemplate') {
    return (
      <TemplateEditor
        initial={editing ?? undefined}
        onSave={handleSaveTemplate}
        onCancel={() => { setEditing(null); setScreen('home') }}
      />
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
            {templates.length === 0 ? (
              <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-5 text-center text-[12px] leading-relaxed text-fg-faint">
                Ei pohjia vielä. Luo pohja Pohjat-välilehdellä.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startWorkout(t)}
                    className="active:scale-[0.99] flex items-center gap-3 rounded-row border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-transform [backdrop-filter:blur(14px)]"
                  >
                    <Dumbbell size={16} className="flex-shrink-0 text-cyan" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] font-semibold text-text">{t.name}</div>
                      <div className="font-mono text-[10px] text-fg-faint">{t.exercises.length} liikettä</div>
                    </div>
                    <Play size={15} className="flex-shrink-0 text-fg-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => { setEditing(null); setScreen('editTemplate') }}
            className="active:scale-[0.98] flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.16] py-4 font-mono text-[13px] uppercase tracking-[0.06em] text-fg-muted transition-transform"
          >
            <Plus size={18} /> Uusi pohja
          </button>
          {templates.map((t) => (
            <Card key={t.id} variant="panel" className="flex items-center gap-3">
              <button
                onClick={() => { setEditing(t); setScreen('editTemplate') }}
                className="flex min-h-0 min-w-0 flex-1 items-center gap-3 bg-transparent p-0 text-left"
              >
                <ClipboardList size={16} className="flex-shrink-0 text-violet" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[14px] font-semibold text-text">{t.name}</div>
                  <div className="font-mono text-[10px] text-fg-faint">{t.exercises.length} liikettä</div>
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-fg-faint" />
              </button>
              <button
                onClick={() => handleDeleteTemplate(t.id)}
                aria-label="Poista pohja"
                className="icon-btn flex min-h-0 min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="flex flex-col gap-2.5">
          {workouts.length === 0 ? (
            <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-8 text-center text-[12px] leading-relaxed text-fg-faint">
              Ei treenejä vielä. Aloita ensimmäinen Treeni-välilehdeltä.
            </p>
          ) : (
            workouts.map((w) => (
              <button
                key={w.id}
                onClick={() => { setViewing(w); setScreen('summary') }}
                className="active:scale-[0.99] flex items-center gap-3 rounded-row border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-transform [backdrop-filter:blur(14px)]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-cyan/[0.12] font-mono text-cyan">
                  <span className="text-[14px] font-bold leading-none tabular-nums">{fromISO(w.date).getDate()}</span>
                  <span className="text-[7px] uppercase tracking-[0.1em]">
                    {fromISO(w.date).toLocaleDateString('fi-FI', { month: 'short' }).replace('.', '')}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[14px] font-semibold text-text">{w.name}</div>
                  <div className="font-mono text-[10px] text-fg-faint">
                    {w.exercises.length} liikettä · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sarjaa
                  </div>
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-fg-faint" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
