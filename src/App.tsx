import { useState, useEffect, useMemo } from 'react'
import type { Settings, SpecialEvent, ExtraWorkout, Meal, WeightEntry, TrainingBurn, AppData } from './types'
import { toISO, addDays } from './lib/dates'
import { computeDays } from './lib/compute'
import { loadData, saveData, exportJSON, importJSON, storageUsedBytes } from './lib/storage'
import { NavBar } from './components/NavBar'
import { TodayView } from './views/TodayView'
import { CalendarView } from './views/CalendarView'
import { WeightView } from './views/WeightView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { s } from './styles/tokens'

type View = 'today' | 'calendar' | 'weight' | 'history' | 'settings'

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
  const [view, setView] = useState<View>('today')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [events, setEvents] = useState<SpecialEvent[]>([])
  const [extras, setExtras] = useState<ExtraWorkout[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [burns, setBurns] = useState<TrainingBurn[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()))
  const [saveError, setSaveError] = useState<'quota' | 'error' | null>(null)

  // Load on mount
  useEffect(() => {
    const data = loadData()
    if (data) {
      if (data.settings) setSettings(data.settings)
      if (data.events) setEvents(data.events)
      if (data.extras) setExtras(data.extras)
      if (data.meals) setMeals(data.meals)
      if (data.weights) setWeights(data.weights)
      if (data.burns) setBurns(data.burns)
    }
    setLoaded(true)
  }, [])

  // Persist on every change
  useEffect(() => {
    if (!loaded) return
    const status = saveData({ settings, events, extras, meals, weights, burns })
    setSaveError(status !== 'ok' ? status : null)
  }, [settings, events, extras, meals, weights, burns, loaded])

  const computed = useMemo(
    () => computeDays(settings, events, extras, meals, burns),
    [settings, events, extras, meals, burns]
  )

  const appData: AppData = useMemo(
    () => ({ settings, events, extras, meals, weights, burns }),
    [settings, events, extras, meals, weights, burns]
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

  if (!loaded) {
    return (
      <div style={s.loading}>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="pulse-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#d4b85a',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Ladataan
        </div>
      </div>
    )
  }

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
          <button
            onClick={() => setSaveError(null)}
            style={{ ...s.iconBtn, fontSize: 16, color: '#e87a6a', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      <NavBar view={view} setView={setView} />

      {view === 'today' && (
        <div className="view-enter">
          <TodayView
            day={computed.days.find((d) => d.date === todayISO)}
            meals={meals.filter((m) => m.date === todayISO)}
            burns={burns.filter((b) => b.date === todayISO)}
            proteinTarget={settings.proteinTarget}
            computed={computed}
            onAddMeal={(meal) => setMeals([...meals, { ...meal, id: Date.now(), date: todayISO }])}
            onDeleteMeal={(id) => setMeals(meals.filter((m) => m.id !== id))}
            onAddBurn={(burn) => setBurns([...burns, { ...burn, id: Date.now(), date: todayISO }])}
            onDeleteBurn={(id) => setBurns(burns.filter((b) => b.id !== id))}
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
            onAddEvent={(ev) => setEvents([...events, { ...ev, id: Date.now() }])}
            onDeleteEvent={(id) => setEvents(events.filter((e) => e.id !== id))}
            onAddExtra={(ex) => setExtras([...extras, { ...ex, id: Date.now() }])}
            onDeleteExtra={(id) => setExtras(extras.filter((e) => e.id !== id))}
          />
        </div>
      )}

      {view === 'weight' && (
        <div className="view-enter">
          <WeightView
            weights={weights}
            onAddWeight={(w) => {
              const filtered = weights.filter((x) => x.date !== w.date)
              setWeights([...filtered, { ...w, id: Date.now() }].sort((a, b) => a.date.localeCompare(b.date)))
            }}
            onDeleteWeight={(id) => setWeights(weights.filter((w) => w.id !== id))}
            onToggleExclude={(id) => setWeights(weights.map((w) => w.id === id ? { ...w, excludeFromTrend: !w.excludeFromTrend } : w))}
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

      {view === 'settings' && (
        <div className="view-enter">
          <SettingsView
            settings={settings}
            setSettings={setSettings}
            computed={computed}
            usedBytes={usedBytes}
            onExport={handleExport}
            onImport={handleImport}
          />
        </div>
      )}
    </div>
  )
}
