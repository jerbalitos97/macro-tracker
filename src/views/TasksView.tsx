import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { toISO, fromISO } from '../lib/dates'
import {
  createTask, deleteTask, listTasksForDate, listTasksInRange,
  rescheduleTask, setTaskDone, type Task,
} from '../lib/tasks'
import { EncouragingHeader } from '../components/tasks/EncouragingHeader'
import { AddTaskForm } from '../components/tasks/AddTaskForm'
import { TaskItem } from '../components/tasks/TaskItem'
import { MonthCalendar } from '../components/tasks/MonthCalendar'

const SHELL =
  'flex min-h-dvh flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-7'

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-row border border-danger/40 bg-danger/[0.08] px-4 py-3 text-[13px] text-danger">
      <AlertCircle size={14} className="shrink-0" />
      {children}
    </p>
  )
}

/** Yhteinen data-kerros molemmille näkymille. */
function useTaskActions(userId: string | undefined, reload: () => void) {
  const [error, setError] = useState<string | null>(null)

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null)
      try {
        await fn()
        reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Toiminto ei onnistunut')
      }
    },
    [reload]
  )

  return {
    error,
    add: (title: string, dateISO: string) =>
      guard(async () => {
        if (userId) await createTask(userId, title, dateISO)
      }),
    toggle: (id: string, done: boolean) =>
      guard(async () => {
        if (userId) await setTaskDone(userId, id, done)
      }),
    reschedule: (id: string, dateISO: string) =>
      guard(async () => {
        if (userId) await rescheduleTask(userId, id, dateISO)
      }),
    remove: (id: string) =>
      guard(async () => {
        if (userId) await deleteTask(userId, id)
      }),
  }
}

// ── Päivänäkymä ──────────────────────────────────────────────

export function TasksView() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const today = toISO(new Date())

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    setLoadError(null)
    listTasksForDate(user.id, today)
      .then((t) => { if (alive) setTasks(t) })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Haku epäonnistui') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user, today, tick])

  const actions = useTaskActions(user?.id, reload)
  const done = tasks.filter((t) => t.done).length

  return (
    <div className={SHELL}>
      <EncouragingHeader done={done} total={tasks.length} />

      {(actions.error || loadError) && <Notice>{actions.error ?? loadError}</Notice>}

      <AddTaskForm date={today} onAdd={actions.add} />

      {loading ? (
        <p className="py-6 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-fg-ghost">Ladataan…</p>
      ) : tasks.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-ghost">
          Ei tehtäviä tälle päivälle.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={actions.toggle}
              onReschedule={actions.reschedule}
              onDelete={actions.remove}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Kuukausinäkymä ───────────────────────────────────────────
// Oma kalenteri, ei Fridayn CalendarView. Se näyttää päivän kaloribudjetin ja
// treenit; tehtävät eivät ole kumpaakaan, ja niiden ujuttaminen samaan ruudukkoon
// tekisi kahdesta eri kysymyksestä yhden sekavan.

export function TasksCalendarView() {
  const { user } = useAuth()
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [month0, setMonth0] = useState(now.getMonth())
  const [selected, setSelected] = useState(toISO(now))
  const [monthTasks, setMonthTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])

  const firstISO = `${year}-${String(month0 + 1).padStart(2, '0')}-01`
  const lastISO = toISO(new Date(year, month0 + 1, 0))

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(null)
    listTasksInRange(user.id, firstISO, lastISO)
      .then((t) => { if (alive) setMonthTasks(t) })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Haku epäonnistui') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user, firstISO, lastISO, tick])

  const actions = useTaskActions(user?.id, reload)

  const openByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of monthTasks) {
      if (t.done) continue
      m.set(t.scheduledDate, (m.get(t.scheduledDate) ?? 0) + 1)
    }
    return m
  }, [monthTasks])

  const dayTasks = useMemo(
    () => monthTasks.filter((t) => t.scheduledDate === selected),
    [monthTasks, selected]
  )

  const step = (delta: -1 | 1) => {
    const d = new Date(year, month0 + delta, 1)
    setYear(d.getFullYear())
    setMonth0(d.getMonth())
  }

  const selectedLabel = fromISO(selected).toLocaleDateString('fi-FI', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className={SHELL}>
      <MonthCalendar
        year={year}
        monthIndex0={month0}
        selectedISO={selected}
        openByDate={openByDate}
        onSelect={setSelected}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
      />

      {(actions.error || loadError) && <Notice>{actions.error ?? loadError}</Notice>}

      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">{selectedLabel}</div>

      <AddTaskForm date={selected} showDate onAdd={actions.add} />

      {loading ? (
        <p className="py-6 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-fg-ghost">Ladataan…</p>
      ) : dayTasks.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-ghost">Ei tehtäviä tälle päivälle.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dayTasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={actions.toggle}
              onReschedule={actions.reschedule}
              onDelete={actions.remove}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
