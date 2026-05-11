import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Settings, SpecialEvent, ExtraWorkout, Meal, WeightEntry, TrainingBurn, DailyAdjustment, AppData, Habit, HabitEntry } from './types'
import { toISO, addDays } from './lib/dates'
import { computeDays } from './lib/compute'
import { loadData, saveData, exportJSON, importJSON, storageUsedBytes } from './lib/storage'
import {
  syncSettings, syncMeal, deleteMeal as syncDeleteMeal,
  syncWeight, deleteWeight as syncDeleteWeight,
  syncBurn, deleteBurn as syncDeleteBurn,
  syncEvent, deleteEvent as syncDeleteEvent,
  syncExtra, deleteExtra as syncDeleteExtra,
  syncAdjustment, deleteAdjustment as syncDeleteAdjustment,
  pushAllData, pullAllData,
} from './lib/sync'
import {
  listHabits, syncHabit, archiveHabit as archiveHabitRemote,
  listEntries as listHabitEntries, syncEntry as syncHabitEntry,
} from './lib/habits'
import { useAuth } from './contexts/AuthContext'
import { NavBar } from './components/NavBar'
import type { View } from './components/NavBar'
import { SyncBadge } from './components/SyncBadge'
import type { SyncStatus } from './components/SyncBadge'
import { MigrationPrompt } from './components/MigrationPrompt'
import { LoginView } from './views/LoginView'
import { TodayView } from './views/TodayView'
import { CalendarView } from './views/CalendarView'
import { WeightView } from './views/WeightView'
import { HistoryView } from './views/HistoryView'
import { GoalView } from './views/GoalView'
import { HabitsView } from './views/HabitsView'
import { SettingsView } from './views/SettingsView'
import { s } from './styles/tokens'

const DEFAULT_SETTINGS: Settings = {
  startDate: toISO(new Date()),
  endDate: addDays(toISO(new Date()), 42),
  startWeight: 74.7,
  targetWeight: 72.9,
  tdee: {
    rest: 2350,
    single: 2750,
    double: 3050,
    volleyball: 2750,
  },
  weeklyPattern: {
    1: 'rest',
    2: 'single',
    3: 'rest',
    4: 'double',
    5: 'volleyball',
    6: 'single',
    0: 'rest',
  },
  proteinTarget: 170,
}

export default function App() {
  const { user, loading: authLoading, enabled: authEnabled } = useAuth()

  const [view, setView] = useState<View>('today')
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [events, setEvents] = useState<SpecialEvent[]>([])
  const [extras, setExtras] = useState<ExtraWorkout[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [burns, setBurns] = useState<TrainingBurn[]>([])
  const [adjustments, setAdjustments] = useState<DailyAdjustment[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitEntries, setHabitEntries] = useState<HabitEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()))
  const [saveError, setSaveError] = useState<'quota' | 'error' | null>(null)

  // Cloud sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [showMigration, setShowMigration] = useState(false)
  const [migrating, setMigrating] = useState(false)

  // Auto-clear the "synced" badge so it doesn't permanently sit over the
  // navbar tabs. 'syncing' / 'error' / 'offline' stay visible until they change.
  useEffect(() => {
    if (syncStatus !== 'synced') return
    const t = setTimeout(() => setSyncStatus('idle'), 2200)
    return () => clearTimeout(t)
  }, [syncStatus])

  // ── Load from localStorage on mount ──────────────────────────
  useEffect(() => {
    const data = loadData()
    if (data) {
      if (data.settings) setSettingsState(data.settings)
      if (data.events) setEvents(data.events)
      if (data.extras) setExtras(data.extras)
      if (data.meals) setMeals(data.meals)
      if (data.weights) setWeights(data.weights)
      if (data.burns) setBurns(data.burns)
      if (data.adjustments) setAdjustments(data.adjustments)
    }
    setLoaded(true)
  }, [])

  // ── Persist to localStorage on every change ───────────────────
  useEffect(() => {
    if (!loaded) return
    const status = saveData({ settings, events, extras, meals, weights, burns, adjustments })
    setSaveError(status !== 'ok' ? status : null)
  }, [settings, events, extras, meals, weights, burns, adjustments, loaded])

  // ── Pull from Supabase on login ───────────────────────────────
  useEffect(() => {
    if (!user || !loaded) return

    const pull = async () => {
      setSyncStatus('syncing')
      const cloudData = await pullAllData(user.id)

      if (cloudData) {
        // Cloud has data → use it as source of truth
        setSettingsState(cloudData.settings)
        setEvents(cloudData.events)
        setExtras(cloudData.extras)
        setMeals(cloudData.meals)
        setWeights(cloudData.weights)
        setBurns(cloudData.burns)
        setAdjustments(cloudData.adjustments ?? [])
        setSyncStatus('synced')
        setShowMigration(false)
      } else {
        // Cloud is empty — check if there's local data to migrate
        const localData = loadData()
        const hasLocal =
          localData &&
          (localData.meals.length > 0 ||
            localData.weights.length > 0 ||
            localData.burns.length > 0)
        if (hasLocal) {
          setShowMigration(true)
        } else {
          // No local data either — push current settings as initial cloud record
          await pushAllData(user.id, {
            settings,
            events,
            extras,
            meals,
            weights,
            burns,
            adjustments,
          })
        }
        setSyncStatus('synced')
      }
    }

    pull()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loaded])

  // ── Habits: pull from cloud on login ──────────────────────────
  useEffect(() => {
    if (!user) {
      setHabits([])
      setHabitEntries([])
      return
    }
    let cancelled = false
    Promise.all([listHabits(user.id), listHabitEntries(user.id)]).then(([hs, es]) => {
      if (cancelled) return
      setHabits(hs)
      setHabitEntries(es)
    })
    return () => { cancelled = true }
  }, [user])

  // ── Migration: push local data to cloud ───────────────────────
  const handleMigrate = useCallback(async () => {
    if (!user) return
    setMigrating(true)
    setSyncStatus('syncing')
    const localData = loadData()
    if (localData) {
      const result = await pushAllData(user.id, localData)
      if (result === 'ok') {
        setSyncStatus('synced')
      } else {
        setSyncStatus('error')
      }
    }
    setMigrating(false)
    setShowMigration(false)
  }, [user])

  // ── Settings mutation ─────────────────────────────────────────
  const setSettings = useCallback(
    (s: Settings) => {
      setSettingsState(s)
      if (user) syncSettings(user.id, s)
    },
    [user],
  )

  // ── Computed values ───────────────────────────────────────────
  const computed = useMemo(
    () => computeDays(settings, events, extras, meals, burns, adjustments),
    [settings, events, extras, meals, burns, adjustments],
  )

  const appData: AppData = useMemo(
    () => ({ settings, events, extras, meals, weights, burns, adjustments }),
    [settings, events, extras, meals, weights, burns, adjustments],
  )

  const usedBytes = useMemo(() => storageUsedBytes(appData), [appData])

  const handleExport = () => exportJSON(appData)
  const handleImport = async (json: string) => {
    const data = importJSON(json)
    if (!data) { alert('Tiedosto ei ole kelvollinen varmuuskopio.'); return }
    if (!window.confirm('Tämä korvaa kaiken nykyisen datan. Jatketaanko?')) return
    const next: AppData = {
      settings: data.settings ?? settings,
      events: data.events ?? [],
      extras: data.extras ?? [],
      meals: data.meals ?? [],
      weights: data.weights ?? [],
      burns: data.burns ?? [],
      adjustments: data.adjustments ?? [],
    }
    if (data.settings) setSettings(data.settings)
    setEvents(next.events)
    setExtras(next.extras)
    setMeals(next.meals)
    setWeights(next.weights)
    setBurns(next.burns)
    setAdjustments(next.adjustments)
    if (user) {
      setSyncStatus('syncing')
      const result = await pushAllData(user.id, next)
      setSyncStatus(result === 'ok' ? 'synced' : 'error')
    }
  }

  const todayISO = toISO(new Date())

  // ── Loading screens ───────────────────────────────────────────
  if (authLoading || !loaded) {
    return (
      <div style={s.loading}>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#d4b85a' }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Ladataan
        </div>
      </div>
    )
  }

  // ── Login screen (only when Supabase is configured and user is not signed in) ─
  if (authEnabled && !user) {
    return <LoginView />
  }

  // ── Main app ──────────────────────────────────────────────────
  return (
    <div style={s.app}>
      {/* Storage error banner */}
      {saveError && (
        <div
          className="banner-enter"
          style={{
            backgroundColor: 'rgba(232,122,106,0.10)',
            borderBottom: '1px solid rgba(232,122,106,0.25)',
            padding: '10px 16px',
            fontSize: 12,
            color: '#e87a6a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>
            {saveError === 'quota'
              ? '⚠ Tallennustila täynnä – vie varmuuskopio Asetuksista.'
              : '⚠ Tallennus epäonnistui – tarkista selainasetusten tallennuslupa.'}
          </span>
          <button onClick={() => setSaveError(null)} style={{ ...s.iconBtn, fontSize: 16, color: '#e87a6a', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Migration prompt */}
      {showMigration && (
        <MigrationPrompt
          onMigrate={handleMigrate}
          onSkip={() => setShowMigration(false)}
          migrating={migrating}
        />
      )}

      {/* Nav with sync badge */}
      <div style={{ position: 'relative' }}>
        <NavBar view={view} setView={setView} />
        {user && syncStatus !== 'idle' && (
          <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 6px)', right: 10, zIndex: 20 }}>
            <SyncBadge status={syncStatus} />
          </div>
        )}
      </div>

      {view === 'habits' && (
        <div className="view-enter">
          <HabitsView
            habits={habits}
            entries={habitEntries}
            onCreate={(input) => {
              if (!user) return
              const now = new Date().toISOString()
              const h: Habit = {
                id: Date.now(),
                name: input.name,
                description: input.description,
                color: input.color,
                habitType: 'build',
                goalPeriod: input.goalPeriod,
                goalValue: input.goalValue,
                goalUnit: input.goalUnit,
                taskDays: [0, 1, 2, 3, 4, 5, 6],
                isArchived: false,
                createdAt: now,
                updatedAt: now,
              }
              setHabits((prev) => [...prev, h])
              syncHabit(user.id, h)
            }}
            onUpdate={(id, patch) => {
              if (!user) return
              setHabits((prev) =>
                prev.map((h) => {
                  if (h.id !== id) return h
                  const updated = { ...h, ...patch, updatedAt: new Date().toISOString() }
                  syncHabit(user.id, updated)
                  return updated
                }),
              )
            }}
            onArchive={(id) => {
              if (!user) return
              setHabits((prev) => prev.filter((h) => h.id !== id))
              archiveHabitRemote(user.id, id)
            }}
            onIncrement={(habit, delta) => {
              if (!user) return
              const today = todayISO
              const existing = habitEntries.find((e) => e.habitId === habit.id && e.date === today)
              const nextValue = Math.max(0, (existing?.value ?? 0) + delta)
              const entry: HabitEntry = existing
                ? { ...existing, value: nextValue }
                : { id: Date.now(), habitId: habit.id, date: today, value: nextValue }
              setHabitEntries((prev) => {
                const without = prev.filter((e) => !(e.habitId === habit.id && e.date === today))
                return [...without, entry]
              })
              syncHabitEntry(user.id, entry)
            }}
            onSetBinary={(habit, done) => {
              if (!user) return
              const today = todayISO
              const existing = habitEntries.find((e) => e.habitId === habit.id && e.date === today)
              const value = done ? 1 : 0
              const entry: HabitEntry = existing
                ? { ...existing, value }
                : { id: Date.now(), habitId: habit.id, date: today, value }
              setHabitEntries((prev) => {
                const without = prev.filter((e) => !(e.habitId === habit.id && e.date === today))
                return [...without, entry]
              })
              syncHabitEntry(user.id, entry)
            }}
          />
        </div>
      )}

      {view === 'today' && (
        <div className="view-enter">
          <TodayView
            day={computed.days.find((d) => d.date === todayISO)}
            meals={meals.filter((m) => m.date === todayISO)}
            burns={burns.filter((b) => b.date === todayISO)}
            proteinTarget={settings.proteinTarget}
            computed={computed}
            onAddMeal={(meal) => {
              const m = { ...meal, id: Date.now(), date: todayISO }
              setMeals((prev) => [...prev, m])
              if (user) syncMeal(user.id, m)
            }}
            onDeleteMeal={(id) => {
              setMeals((prev) => prev.filter((m) => m.id !== id))
              if (user) syncDeleteMeal(user.id, id)
            }}
            onAddBurn={(burn) => {
              const b = { ...burn, id: Date.now(), date: todayISO }
              setBurns((prev) => [...prev, b])
              if (user) syncBurn(user.id, b)
            }}
            onDeleteBurn={(id) => {
              setBurns((prev) => prev.filter((b) => b.id !== id))
              if (user) syncDeleteBurn(user.id, id)
            }}
            onSetAdjustment={(date, kcal, note) => {
              const existing = adjustments.find((a) => a.date === date)
              const a: DailyAdjustment = existing
                ? { ...existing, kcal, note }
                : { id: Date.now(), date, kcal, note }
              setAdjustments((prev) => {
                const without = prev.filter((p) => p.date !== date)
                return [...without, a]
              })
              if (user) syncAdjustment(user.id, a)
            }}
          />
        </div>
      )}

      {view === 'calendar' && (
        <div className="view-enter">
          <CalendarView
            computed={computed}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedDay={computed.days.find((d) => d.date === selectedDate)}
            events={events}
            extras={extras}
            onAddEvent={(ev) => {
              const e = { ...ev, id: Date.now() }
              setEvents((prev) => [...prev, e])
              if (user) syncEvent(user.id, e)
            }}
            onDeleteEvent={(id) => {
              setEvents((prev) => prev.filter((e) => e.id !== id))
              if (user) syncDeleteEvent(user.id, id)
            }}
            onAddExtra={(ex) => {
              const x = { ...ex, id: Date.now() }
              setExtras((prev) => [...prev, x])
              if (user) syncExtra(user.id, x)
            }}
            onDeleteExtra={(id) => {
              setExtras((prev) => prev.filter((e) => e.id !== id))
              if (user) syncDeleteExtra(user.id, id)
            }}
            onSetAdjustment={(date, kcal, note) => {
              const existing = adjustments.find((a) => a.date === date)
              const a: DailyAdjustment = existing
                ? { ...existing, kcal, note }
                : { id: Date.now(), date, kcal, note }
              setAdjustments((prev) => {
                const without = prev.filter((p) => p.date !== date)
                return [...without, a]
              })
              if (user) syncAdjustment(user.id, a)
            }}
            onDeleteAdjustment={(id) => {
              setAdjustments((prev) => prev.filter((a) => a.id !== id))
              if (user) syncDeleteAdjustment(user.id, id)
            }}
          />
        </div>
      )}

      {view === 'weight' && (
        <div className="view-enter">
          <WeightView
            weights={weights}
            onAddWeight={(w) => {
              const entry = { ...w, id: Date.now() }
              setWeights((prev) =>
                [...prev.filter((x) => x.date !== w.date), entry].sort((a, b) =>
                  a.date.localeCompare(b.date),
                ),
              )
              if (user) syncWeight(user.id, entry)
            }}
            onDeleteWeight={(id) => {
              setWeights((prev) => prev.filter((w) => w.id !== id))
              if (user) syncDeleteWeight(user.id, id)
            }}
            onToggleExclude={(id) => {
              setWeights((prev) =>
                prev.map((w) => {
                  if (w.id !== id) return w
                  const updated = { ...w, excludeFromTrend: !w.excludeFromTrend }
                  if (user) syncWeight(user.id, updated)
                  return updated
                }),
              )
            }}
            settings={settings}
            meals={meals}
          />
        </div>
      )}

      {view === 'history' && (
        <div className="view-enter">
          <HistoryView computed={computed} settings={settings} weights={weights} />
        </div>
      )}

      {view === 'goal' && (
        <div className="view-enter">
          <GoalView settings={settings} weights={weights} computed={computed} />
        </div>
      )}

      {view === 'settings' && (
        <div className="view-enter">
          <SettingsView
            settings={settings}
            setSettings={setSettings}
            computed={computed}
            usedBytes={usedBytes}
            onExport={handleExport}
            onImport={handleImport}
            user={user}
          />
        </div>
      )}
    </div>
  )
}
