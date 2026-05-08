import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Settings, SpecialEvent, ExtraWorkout, Meal, WeightEntry, TrainingBurn, AppData } from './types'
import { toISO, addDays } from './lib/dates'
import { computeDays } from './lib/compute'
import { loadData, saveData, exportJSON, importJSON, storageUsedBytes } from './lib/storage'
import {
  syncSettings, syncMeal, deleteMeal as syncDeleteMeal,
  syncWeight, deleteWeight as syncDeleteWeight,
  syncBurn, deleteBurn as syncDeleteBurn,
  syncEvent, deleteEvent as syncDeleteEvent,
  syncExtra, deleteExtra as syncDeleteExtra,
  pushAllData, pullAllData,
} from './lib/sync'
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
  const [loaded, setLoaded] = useState(false)
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()))
  const [saveError, setSaveError] = useState<'quota' | 'error' | null>(null)

  // Cloud sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [showMigration, setShowMigration] = useState(false)
  const [migrating, setMigrating] = useState(false)

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
    }
    setLoaded(true)
  }, [])

  // ── Persist to localStorage on every change ───────────────────
  useEffect(() => {
    if (!loaded) return
    const status = saveData({ settings, events, extras, meals, weights, burns })
    setSaveError(status !== 'ok' ? status : null)
  }, [settings, events, extras, meals, weights, burns, loaded])

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
          })
        }
        setSyncStatus('synced')
      }
    }

    pull()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loaded])

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
    () => computeDays(settings, events, extras, meals, burns),
    [settings, events, extras, meals, burns],
  )

  const appData: AppData = useMemo(
    () => ({ settings, events, extras, meals, weights, burns }),
    [settings, events, extras, meals, weights, burns],
  )

  const usedBytes = useMemo(() => storageUsedBytes(appData), [appData])

  const handleExport = () => exportJSON(appData)
  const handleImport = (json: string) => {
    const data = importJSON(json)
    if (!data) { alert('Tiedosto ei ole kelvollinen varmuuskopio.'); return }
    if (!window.confirm('Tämä korvaa kaiken nykyisen datan. Jatketaanko?')) return
    if (data.settings) setSettings(data.settings)
    setEvents(data.events ?? [])
    setExtras(data.extras ?? [])
    setMeals(data.meals ?? [])
    setWeights(data.weights ?? [])
    setBurns(data.burns ?? [])
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
          <div style={{ position: 'absolute', top: 6, right: 10, zIndex: 20 }}>
            <SyncBadge status={syncStatus} />
          </div>
        )}
      </div>

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
          <GoalView settings={settings} weights={weights} />
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
