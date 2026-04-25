import { useState, useEffect, useMemo } from 'react'
import type { Settings, SpecialEvent, ExtraWorkout, Meal, WeightEntry, AppData } from './types'
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
    }
    setLoaded(true)
  }, [])

  // Persist on every change — report quota/error visibly
  useEffect(() => {
    if (!loaded) return
    const status = saveData({ settings, events, extras, meals, weights })
    if (status !== 'ok') {
      setSaveError(status)
    } else {
      setSaveError(null)
    }
  }, [settings, events, extras, meals, weights, loaded])

  const computed = useMemo(
    () => computeDays(settings, events, extras, meals),
    [settings, events, extras, meals]
  )

  const appData: AppData = useMemo(
    () => ({ settings, events, extras, meals, weights }),
    [settings, events, extras, meals, weights]
  )

  const usedBytes = useMemo(() => storageUsedBytes(appData), [appData])

  const handleExport = () => exportJSON(appData)

  const handleImport = (json: string) => {
    const data = importJSON(json)
    if (!data) {
      alert('Tiedosto ei ole kelvollinen varmuuskopio.')
      return
    }
    if (!window.confirm('Tämä korvaa kaiken nykyisen datan. Jatketaanko?')) return
    if (data.settings) setSettings(data.settings)
    setEvents(data.events ?? [])
    setExtras(data.extras ?? [])
    setMeals(data.meals ?? [])
    setWeights(data.weights ?? [])
  }

  const todayISO = toISO(new Date())

  if (!loaded) {
    return (
      <div style={s.loading}>
        <div style={{ color: '#666', fontFamily: 'ui-monospace, monospace' }}>Ladataan...</div>
      </div>
    )
  }

  return (
    <div style={s.app}>
      {/* Storage error banner */}
      {saveError && (
        <div
          style={{
            backgroundColor: saveError === 'quota' ? '#3a1a0e' : '#2a0e0e',
            borderBottom: `1px solid ${saveError === 'quota' ? '#e87a6a' : '#e84a4a'}`,
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
              ? '⚠️ Tallennustila täynnä – vie varmuuskopio Asetuksista ja poista vanhoja kirjauksia.'
              : '⚠️ Tallennus epäonnistui – tarkista selainasetusten tallennuslupa.'}
          </span>
          <button
            onClick={() => setSaveError(null)}
            style={{ ...s.iconBtn, fontSize: 16, padding: 0, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      <NavBar view={view} setView={setView} />

      {view === 'today' && (
        <TodayView
          day={computed.days.find((d) => d.date === todayISO)}
          meals={meals.filter((m) => m.date === todayISO)}
          proteinTarget={settings.proteinTarget}
          computed={computed}
          onAddMeal={(meal) =>
            setMeals([...meals, { ...meal, id: Date.now(), date: todayISO }])
          }
          onDeleteMeal={(id) => setMeals(meals.filter((m) => m.id !== id))}
        />
      )}

      {view === 'calendar' && (
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
      )}

      {view === 'weight' && (
        <WeightView
          weights={weights}
          onAddWeight={(w) => {
            const filtered = weights.filter((x) => x.date !== w.date)
            setWeights(
              [...filtered, { ...w, id: Date.now() }].sort((a, b) =>
                a.date.localeCompare(b.date)
              )
            )
          }}
          onDeleteWeight={(id) => setWeights(weights.filter((w) => w.id !== id))}
          onToggleExclude={(id) =>
            setWeights(
              weights.map((w) =>
                w.id === id ? { ...w, excludeFromTrend: !w.excludeFromTrend } : w
              )
            )
          }
          settings={settings}
          meals={meals}
        />
      )}

      {view === 'history' && (
        <HistoryView computed={computed} settings={settings} weights={weights} />
      )}

      {view === 'settings' && (
        <SettingsView
          settings={settings}
          setSettings={setSettings}
          computed={computed}
          usedBytes={usedBytes}
          onExport={handleExport}
          onImport={handleImport}
        />
      )}
    </div>
  )
}
