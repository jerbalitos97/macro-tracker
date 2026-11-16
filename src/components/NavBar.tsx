import { LayoutGrid, CalendarDays, ListChecks, TrendingDown, BarChart2, SlidersHorizontal, Wallet, Dumbbell, ShoppingBasket, CalendarRange, CheckSquare, Sprout, ShieldCheck, FlaskConical, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTools } from '../contexts/ToolsContext'
import { VIEW_TOOL } from '../lib/viewAccess'

type View =
  | 'home'
  | 'today'
  | 'habits'
  | 'calendar'
  | 'weight'
  | 'analysis'
  | 'settings'
  | 'wealth'
  | 'wealth-settings'
  | 'workout'
  | 'grocery'
  | 'planning'
  | 'tasks'
  | 'tasks-calendar'
  | 'mobility'
  | 'testi'
  | 'admin'

interface Tab {
  id: View
  label: string
  Icon: LucideIcon
}

// Material 3 navigation bar, at the bottom where the thumb is. Koti is no
// longer a tab in every set: it was the first tab of all nine sets, so every
// tool spent a fifth of its bar on "leave this tool". The launcher now hangs
// off the app bar's grid button (AppBar below), and a tool with a single
// screen gets no bar at all.
const FITNESS_TABS: Tab[] = [
  { id: 'today',    label: 'Tänään',    Icon: Sun },
  { id: 'calendar', label: 'Kalenteri', Icon: CalendarDays },
  { id: 'weight',   label: 'Paino',     Icon: TrendingDown },
  { id: 'analysis', label: 'Analyysi',  Icon: BarChart2 },
]

const WEALTH_TABS: Tab[] = [
  { id: 'wealth',          label: 'Wealth',    Icon: Wallet },
  { id: 'wealth-settings', label: 'Asetukset', Icon: SlidersHorizontal },
]

// Planning spans both Fitness and Workout, so it hangs off the launcher rather
// than living inside either tool's tab set. App-level settings sit next to it
// because that is where someone goes to configure rather than to log.
const PLANNING_TABS: Tab[] = [
  { id: 'planning', label: 'Suunnittelu', Icon: CalendarRange },
  { id: 'settings', label: 'Asetukset',   Icon: SlidersHorizontal },
]

// Tehtävillä on oma kalenteri eikä Fridayn CalendarView. Sama ruudukko näyttäisi
// päivän kaloribudjetin ja tehtävälistan yhtä aikaa, ja ne ovat eri kysymys.
const TASKS_TABS: Tab[] = [
  { id: 'tasks',          label: 'Tehtävät',  Icon: CheckSquare },
  { id: 'tasks-calendar', label: 'Kalenteri', Icon: CalendarDays },
]

const SINGLE: Partial<Record<View, Tab>> = {
  habits:   { id: 'habits',   label: 'Tavat',      Icon: ListChecks },
  workout:  { id: 'workout',  label: 'Workout',    Icon: Dumbbell },
  grocery:  { id: 'grocery',  label: 'Ostoslista', Icon: ShoppingBasket },
  mobility: { id: 'mobility', label: 'Liikkuvuus', Icon: Sprout },
  testi:    { id: 'testi',    label: 'Testi',      Icon: FlaskConical },
  admin:    { id: 'admin',    label: 'Käyttäjät',  Icon: ShieldCheck },
}

function tabsForView(v: View): Tab[] {
  if (v === 'wealth' || v === 'wealth-settings') return WEALTH_TABS
  if (v === 'planning' || v === 'settings') return PLANNING_TABS
  if (v === 'tasks' || v === 'tasks-calendar') return TASKS_TABS
  const single = SINGLE[v]
  if (single) return [single]
  return FITNESS_TABS
}

/** The tool a view belongs to, as the app bar names it. */
export function toolTitle(v: View): string {
  if (v === 'today' || v === 'calendar' || v === 'weight' || v === 'analysis') return 'Fitness'
  if (v === 'wealth' || v === 'wealth-settings') return 'Wealth'
  if (v === 'planning' || v === 'settings') return 'Suunnittelu'
  if (v === 'tasks' || v === 'tasks-calendar') return 'Tehtävät'
  return SINGLE[v]?.label ?? ''
}

export type { View }

interface Props {
  view: View
  setView: (v: View) => void
  /** Välilehdet jotka eivät tässä tilassa tarkoita mitään (esim. Analyysi
   *  kirjaustilassa ilman tavoitejaksoa). Ei oikeusraja — se on VIEW_TOOL. */
  hidden?: View[]
}

export function NavBar({ view, setView, hidden }: Props) {
  const { tools } = useTools()
  // Jokainen tab tarkistetaan erikseen: PLANNING_TABS niputtaa Suunnittelun ja
  // Asetukset, joten pelkkä "tämän työkalun tabit" ei riitä.
  const tabs = tabsForView(view).filter((t) => {
    if (hidden?.includes(t.id)) return false
    const needed = VIEW_TOOL[t.id]
    return needed === null || tools.includes(needed)
  })
  if (tabs.length < 2) return null

  return (
    <nav
      role="tablist"
      aria-label={toolTitle(view)}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[480px] border-t border-white/[0.06] bg-[rgba(5,6,12,0.82)] pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`nav-btn flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent pb-4 pt-3 text-[12px] leading-4 ${
              active ? 'font-semibold text-accent' : 'font-medium text-fg-muted'
            }`}
            onClick={() => setView(tab.id)}
          >
            <span
              className={`flex h-8 w-16 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200 ${
                active ? 'bg-cyan/[0.16] text-[#cde7ec] shadow-[0_0_18px_rgba(34,211,238,0.35)]' : ''
              }`}
            >
              <tab.Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
            </span>
            <span className="max-w-full truncate">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Top app bar: the launcher button, the tool's name, and a trailing slot
 *  (the sync badge). Sticky, and padded under the Dynamic Island. */
export function AppBar({ view, onHome, trailing }: { view: View; onHome: () => void; trailing?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-1 bg-[rgba(5,6,12,0.82)] px-1 pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onHome}
        aria-label="Vaihda työkalua"
        className="icon-btn flex h-12 w-12 items-center justify-center rounded-full text-text"
      >
        <LayoutGrid size={22} />
      </button>
      <h1 className="m-0 min-w-0 flex-1 truncate text-[22px] font-medium leading-[64px] text-text">{toolTitle(view)}</h1>
      {trailing && <div className="pr-3">{trailing}</div>}
    </header>
  )
}
