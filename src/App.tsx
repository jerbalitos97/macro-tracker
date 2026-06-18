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
import { SurplusPrompt } from './components/SurplusPrompt'
import { getAcknowledgedSurpluses, acknowledgeSurplus } from './lib/surplusAck'
import { LoginView } from './views/LoginView'
import { HomeView } from './views/HomeView'
import { WealthView } from './views/WealthView'
import { WealthSettingsView } from './views/WealthSettingsView'
import { WorkoutView } from './views/WorkoutView'
import { GroceryView } from './views/GroceryView'
import { sharedListIdFromUrl } from './lib/grocery'
import { TodayView } from './views/TodayView'
import { CalendarView } from './views/CalendarView'
import { WeightView } from './views/WeightView'
import { HistoryView } from './views/HistoryView'
import { GoalView } from './views/GoalView'
import { HabitsView } from './views/HabitsView'
import { SettingsView } from './views/SettingsView'
import { LazyMotion, domMax, m, AnimatePresence } from 'motion/react'

const viewMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
}

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

  // A ?g=<listId> share link deep-links straight into the Grocery tool.
  const [view, setView] = useState<View>(() => (sharedListIdFromUrl() ? 'grocery' : 'home'))
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
  const [ackedSurpluses, setAckedSurpluses] = useState<Set<string>>(() => getAcknowledgedSurpluses())

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

  // ── Surplus prompt: did yesterday earn extra deficit? ────────
  const surplusOffer = useMemo(() => {
    if (!loaded) return null
    const yesterday = addDays(todayISO, -1)
    if (ackedSurpluses.has(yesterday)) return null
    const day = computed.days.find((d) => d.date === yesterday)
    if (!day || day.actualDeficit === undefined || day.actualDeficit === null) return null
    const extra = day.actualDeficit - day.dailyDeficitBase
    // Only nudge when the surplus is meaningful — ~one snack worth or more.
    if (extra < 200) return null
    return { date: yesterday, surplus: Math.round(extra) }
  }, [loaded, computed, todayISO, ackedSurpluses])

  const applySurplusToDate = useCallback(
    (date: string, addKcal: number, sourceDate: string) => {
      if (!user) return
      const existing = adjustments.find((a) => a.date === date)
      const newKcal = (existing?.kcal ?? 0) + addKcal
      const tag = `bonus ${sourceDate.slice(5)}`
      const noteParts = [existing?.note, tag].filter(Boolean)
      const updated: DailyAdjustment = existing
        ? { ...existing, kcal: newKcal, note: noteParts.join(' · ') }
        : { id: Date.now() + Math.floor(Math.random() * 1000), date, kcal: newKcal, note: tag }
      setAdjustments((prev) => [...prev.filter((a) => a.date !== date), updated])
      syncAdjustment(user.id, updated)
    },
    [user, adjustments],
  )

  const handleSurplusSpread = useCallback(
    (days: number) => {
      if (!surplusOffer) return
      const perDay = Math.floor(surplusOffer.surplus / days)
      for (let i = 0; i < days; i++) {
        const target = addDays(todayISO, i)
        if (target > settings.endDate) break
        applySurplusToDate(target, perDay, surplusOffer.date)
      }
      acknowledgeSurplus(surplusOffer.date)
      setAckedSurpluses(getAcknowledgedSurpluses())
    },
    [surplusOffer, todayISO, settings.endDate, applySurplusToDate],
  )

  const handleSurplusSingle = useCallback(
    (date: string) => {
      if (!surplusOffer) return
      applySurplusToDate(date, surplusOffer.surplus, surplusOffer.date)
      acknowledgeSurplus(surplusOffer.date)
      setAckedSurpluses(getAcknowledgedSurpluses())
    },
    [surplusOffer, applySurplusToDate],
  )

  const handleSurplusDismiss = useCallback(() => {
    if (!surplusOffer) return
    acknowledgeSurplus(surplusOffer.date)
    setAckedSurpluses(getAcknowledgedSurpluses())
  }, [surplusOffer])

  // ── Loading screens ───────────────────────────────────────────
  if (authLoading || !loaded) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg">
        <div className="flex gap-[7px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pulse-dot h-2 w-2 rounded-full bg-accent" />
          ))}
        </div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-[#333]">Ladataan</div>
      </div>
    )
  }

  // ── Shared grocery link (?g=…) → LOCKED grocery-only mode ──────────
  // Anyone opening a shared list sees ONLY that list: no top nav, no Koti, no
  // access to any other view or the owner's data. Runs before the login gate
  // and regardless of whether the opener is signed in — no account needed
  // (the Supabase anon role can read/write the shared list). GroceryView loads
  // the shared list (not the opener's own) because ?g= is present.
  if (sharedListIdFromUrl()) {
    return (
      <LazyMotion features={domMax}>
        <div className="mx-auto min-h-dvh w-full max-w-[480px] overflow-x-clip text-text pb-[calc(40px+env(safe-area-inset-bottom))]">
          <GroceryView />
        </div>
      </LazyMotion>
    )
  }

  // ── Login screen (only when Supabase is configured and user is not signed in) ─
  if (authEnabled && !user) {
    return <LoginView />
  }

  // ── Main app ──────────────────────────────────────────────────
  return (
    <LazyMotion features={domMax}>
    <div className="mx-auto min-h-dvh w-full max-w-[480px] overflow-x-clip text-text pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* Storage error banner */}
      {saveError && (
        <div className="banner-enter flex items-center justify-between gap-3 border-b border-danger/25 bg-danger/10 px-4 py-2.5 text-xs text-danger">
          <span>
            {saveError === 'quota'
              ? '⚠ Tallennustila täynnä – vie varmuuskopio Asetuksista.'
              : '⚠ Tallennus epäonnistui – tarkista selainasetusten tallennuslupa.'}
          </span>
          <button onClick={() => setSaveError(null)} className="flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-base leading-none text-danger">×</button>
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

      {/* Surplus prompt — fires when yesterday's deficit beat the plan */}
      {surplusOffer && !showMigration && (
        <SurplusPrompt
          surplusDate={surplusOffer.date}
          surplus={surplusOffer.surplus}
          cutEndDate={settings.endDate}
          onApplySpread={handleSurplusSpread}
          onApplySingle={handleSurplusSingle}
          onDismiss={handleSurplusDismiss}
        />
      )}

      {/* Nav with sync badge — hidden on the launcher (home) view */}
      {view !== 'home' && (
        <div className="relative">
          <NavBar view={view} setView={setView} />
          {user && syncStatus !== 'idle' && (
            <div className="absolute right-2.5 top-[calc(env(safe-area-inset-top)+6px)] z-20">
              <SyncBadge status={syncStatus} />
            </div>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
      {view === 'home' && (
        <m.div key={view} {...viewMotion}>
          <HomeView setView={setView} />
        </m.div>
      )}

      {view === 'wealth' && (
        <m.div key={view} {...viewMotion}>
          <WealthView onOpenSettings={() => setView('wealth-settings')} />
        </m.div>
      )}

      {view === 'wealth-settings' && (
        <m.div key={view} {...viewMotion}>
          <WealthSettingsView onBack={() => setView('wealth')} />
        </m.div>
      )}

      {view === 'workout' && (
        <m.div key={view} {...viewMotion}>
          <WorkoutView />
        </m.div>
      )}

      {view === 'grocery' && (
        <m.div key={view} {...viewMotion}>
          <GroceryView />
        </m.div>
      )}

      {view === 'habits' && (
        <m.div key={view} {...viewMotion}>
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
            onIncrement={(habit, delta, date) => {
              if (!user) return
              const existing = habitEntries.find((e) => e.habitId === habit.id && e.date === date)
              const nextValue = Math.max(0, (existing?.value ?? 0) + delta)
              const entry: HabitEntry = existing
                ? { ...existing, value: nextValue }
                : { id: Date.now(), habitId: habit.id, date, value: nextValue }
              setHabitEntries((prev) => {
                const without = prev.filter((e) => !(e.habitId === habit.id && e.date === date))
                return [...without, entry]
              })
              syncHabitEntry(user.id, entry)
            }}
            onSetBinary={(habit, done, date) => {
              if (!user) return
              const existing = habitEntries.find((e) => e.habitId === habit.id && e.date === date)
              const value = done ? 1 : 0
              const entry: HabitEntry = existing
                ? { ...existing, value }
                : { id: Date.now(), habitId: habit.id, date, value }
              setHabitEntries((prev) => {
                const without = prev.filter((e) => !(e.habitId === habit.id && e.date === date))
                return [...without, entry]
              })
              syncHabitEntry(user.id, entry)
            }}
          />
        </m.div>
      )}

      {view === 'today' && (
        <m.div key={view} {...viewMotion}>
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
        </m.div>
      )}

      {view === 'calendar' && (
        <m.div key={view} {...viewMotion}>
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
            meals={meals}
            burns={burns}
            onAddMealOnDate={(meal, date) => {
              const m = { ...meal, id: Date.now(), date }
              setMeals((prev) => [...prev, m])
              if (user) syncMeal(user.id, m)
            }}
            onDeleteMeal={(id) => {
              setMeals((prev) => prev.filter((m) => m.id !== id))
              if (user) syncDeleteMeal(user.id, id)
            }}
            onAddBurnOnDate={(burn, date) => {
              const b = { ...burn, id: Date.now(), date }
              setBurns((prev) => [...prev, b])
              if (user) syncBurn(user.id, b)
            }}
            onDeleteBurn={(id) => {
              setBurns((prev) => prev.filter((b) => b.id !== id))
              if (user) syncDeleteBurn(user.id, id)
            }}
          />
        </m.div>
      )}

      {view === 'weight' && (
        <m.div key={view} {...viewMotion}>
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
        </m.div>
      )}

      {view === 'history' && (
        <m.div key={view} {...viewMotion}>
          <HistoryView computed={computed} settings={settings} weights={weights} />
        </m.div>
      )}

      {view === 'goal' && (
        <m.div key={view} {...viewMotion}>
          <GoalView settings={settings} weights={weights} computed={computed} />
        </m.div>
      )}

      {view === 'settings' && (
        <m.div key={view} {...viewMotion}>
          <SettingsView
            settings={settings}
            setSettings={setSettings}
            computed={computed}
            usedBytes={usedBytes}
            onExport={handleExport}
            onImport={handleImport}
            user={user}
          />
        </m.div>
      )}
      </AnimatePresence>
    </div>
    </LazyMotion>
  )
}
