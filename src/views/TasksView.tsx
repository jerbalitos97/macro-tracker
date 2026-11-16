import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { snack } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { toISO, fromISO, addDays } from '../lib/dates'
import {
  createTask, deleteTask, listOpenThrough, listTasksInRange,
  rescheduleTask, setTaskDone, type Task,
} from '../lib/tasks'
import { EncouragingHeader } from '../components/tasks/EncouragingHeader'
import { AddTaskForm } from '../components/tasks/AddTaskForm'
import { TaskItem } from '../components/tasks/TaskItem'
import { MonthCalendar } from '../components/tasks/MonthCalendar'

const SHELL =
  'flex min-h-dvh flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-2'

/** Listaryhmä: rivit 2px raoin, yhteiset pyöristetyt kulmat. */
const LIST = 'flex flex-col gap-0.5 overflow-hidden rounded-[20px]'
const GROUP_LABEL = 'px-1 pt-1 text-[16px] font-medium leading-6 text-text'
const EMPTY = 'px-1 text-[14px] leading-5 text-fg-muted'

function movedText(dateISO: string): string {
  const today = toISO(new Date())
  if (dateISO === today) return 'Siirretty tälle päivälle'
  if (dateISO === addDays(today, 1)) return 'Siirretty huomiseen'
  return `Siirretty: ${fromISO(dateISO).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })}`
}

// Istunnonaikainen välimuisti. Ilman tätä jokainen paluu työkaluun näyttää
// "Ladataan…" vaikka sama lista haettiin sekunti sitten toisella välilehdellä —
// ja juuri se lukee välkyntänä. Näytetään viimeksi nähty heti ja annetaan
// taustahaun korjata hiljaa. Muisti tyhjenee reloadissa, joten tämä ei ole
// uusi totuuden lähde vaan pelkkä paluumatkan pehmennys.
const dayCache = new Map<string, Task[]>()
const monthCache = new Map<string, Task[]>()

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="card-enter flex items-center gap-2 rounded-row border border-danger/40 bg-danger/[0.08] px-4 py-3 text-[14px] text-danger">
      <AlertCircle size={16} className="shrink-0" />
      {children}
    </p>
  )
}

/** Yhteinen data-kerros molemmille näkymille. */
function useTaskActions(userId: string | undefined, reload: () => void) {
  const [error, setError] = useState<string | null>(null)

  const guard = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      setError(null)
      try {
        await fn()
        reload()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Toiminto ei onnistunut')
        return false
      }
    },
    [reload]
  )

  const add = (title: string, dateISO: string) =>
    guard(async () => {
      if (userId) await createTask(userId, title, dateISO)
    })
  const moveTo = (id: string, dateISO: string) =>
    guard(async () => {
      if (userId) await rescheduleTask(userId, id, dateISO)
    })

  return {
    error,
    add,
    toggle: (id: string, done: boolean) =>
      guard(async () => {
        if (userId) await setTaskDone(userId, id, done)
      }),
    // Siirto ja poisto tapahtuvat heti; snackbarin "Kumoa" palauttaa.
    // Siirron kumoaminen on paluu vanhaan päivään. Poiston kumoaminen luo
    // tehtävän uudelleen samalla nimellä ja päivällä (uusi id) — poistettavat
    // ovat aina avoimia, joten tila ei katoa.
    reschedule: async (task: Task, dateISO: string) => {
      const from = task.scheduledDate
      if (!(await moveTo(task.id, dateISO))) return
      snack({ text: movedText(dateISO), onAction: () => { void moveTo(task.id, from) } })
    },
    remove: async (task: Task) => {
      const ok = await guard(async () => {
        if (userId) await deleteTask(userId, task.id)
      })
      if (!ok) return
      snack({ text: 'Tehtävä poistettu', onAction: () => { void add(task.title, task.scheduledDate) } })
    },
  }
}

// ── Päivänäkymä ──────────────────────────────────────────────

export function TasksView() {
  const { user } = useAuth()
  const today = toISO(new Date())
  const cacheKey = `${user?.id ?? ''}:${today}`
  const [tasks, setTasks] = useState<Task[]>(() => dayCache.get(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !dayCache.has(cacheKey))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    setLoadError(null)
    listOpenThrough(user.id, today)
      .then((t) => {
        dayCache.set(cacheKey, t)
        if (alive) setTasks(t)
      })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Haku epäonnistui') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user, today, cacheKey, tick])

  const actions = useTaskActions(user?.id, reload)
  // Rästit ovat aiemmille päiville ajoitettuja tekemättömiä. Ne näkyvät omana
  // ryhmänään päivämäärineen eivätkä sekoitu tämän päivän listaan: "mitä tänään
  // on tarkoitus tehdä" ja "mikä jäi" ovat eri kysymys, ja yhteen listaan
  // sulautettuna vanhin rivi hautautuisi kaikkein varmimmin.
  const overdue = tasks.filter((t) => !t.done && t.scheduledDate < today)
  const todays = tasks.filter((t) => t.scheduledDate === today)
  const done = todays.filter((t) => t.done).length

  return (
    <div className={SHELL}>
      <EncouragingHeader done={done} total={todays.length} />

      {(actions.error || loadError) && <Notice>{actions.error ?? loadError}</Notice>}

      <AddTaskForm date={today} onAdd={actions.add} />

      {loading ? (
        <p className={`${EMPTY} py-6 text-center`}>Ladataan…</p>
      ) : tasks.length === 0 ? (
        <p className={EMPTY}>Ei tehtäviä tälle päivälle.</p>
      ) : (
        <>
          {overdue.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className={GROUP_LABEL}>Aiemmilta päiviltä ({overdue.length})</div>
              <ul className={LIST}>
                {overdue.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    carriedFrom={t.scheduledDate}
                    onToggle={actions.toggle}
                    onReschedule={actions.reschedule}
                    onDelete={actions.remove}
                  />
                ))}
              </ul>
            </div>
          )}

          {todays.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className={GROUP_LABEL}>Tänään ({todays.length})</div>
              <ul className={`list-stagger ${LIST}`}>
                {todays.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onToggle={actions.toggle}
                    onReschedule={actions.reschedule}
                    onDelete={actions.remove}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
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
  const cacheKey = `${user?.id ?? ''}:${firstISO}`

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    const cached = monthCache.get(cacheKey)
    if (cached) {
      setMonthTasks(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setLoadError(null)
    listTasksInRange(user.id, firstISO, lastISO)
      .then((t) => {
        monthCache.set(cacheKey, t)
        if (alive) setMonthTasks(t)
      })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : 'Haku epäonnistui') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user, firstISO, lastISO, cacheKey, tick])

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

      <div className={`${GROUP_LABEL} first-letter:uppercase`}>
        {selected === toISO(now) ? 'Tänään, ' : ''}{selectedLabel}
      </div>

      <AddTaskForm date={selected} placeholder="Uusi tehtävä tälle päivälle…" onAdd={actions.add} />

      {loading ? (
        <p className={`${EMPTY} py-6 text-center`}>Ladataan…</p>
      ) : dayTasks.length === 0 ? (
        <p className={EMPTY}>Ei tehtäviä tälle päivälle.</p>
      ) : (
        <ul className={`list-stagger ${LIST}`}>
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
