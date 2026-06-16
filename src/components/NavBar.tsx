import { Home, LayoutGrid, CalendarDays, ListChecks, TrendingDown, BarChart2, SlidersHorizontal, Target, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type View =
  | 'home'
  | 'today'
  | 'habits'
  | 'calendar'
  | 'weight'
  | 'history'
  | 'goal'
  | 'settings'
  | 'wealth'
  | 'wealth-settings'

interface Tab {
  id: View
  label: string
  Icon: LucideIcon
}

// Two tab sets — the navbar selects the right one based on the current view,
// so Habit tracking and Fitness tracking each get their own self-contained
// tool navigation rooted at the launcher (Koti).
const FITNESS_TABS: Tab[] = [
  { id: 'home',     label: 'Koti',      Icon: LayoutGrid },
  { id: 'today',    label: 'Tänään',    Icon: Home },
  { id: 'calendar', label: 'Kalenteri', Icon: CalendarDays },
  { id: 'weight',   label: 'Paino',     Icon: TrendingDown },
  { id: 'history',  label: 'Trendit',   Icon: BarChart2 },
  { id: 'goal',     label: 'Tavoite',   Icon: Target },
  { id: 'settings', label: 'Asetukset', Icon: SlidersHorizontal },
]

const HABIT_TABS: Tab[] = [
  { id: 'home',   label: 'Koti',  Icon: LayoutGrid },
  { id: 'habits', label: 'Tavat', Icon: ListChecks },
]

const WEALTH_TABS: Tab[] = [
  { id: 'home',            label: 'Koti',      Icon: LayoutGrid },
  { id: 'wealth',          label: 'Wealth',    Icon: Wallet },
  { id: 'wealth-settings', label: 'Asetukset', Icon: SlidersHorizontal },
]

function tabsForView(v: View): Tab[] {
  if (v === 'habits') return HABIT_TABS
  if (v === 'wealth' || v === 'wealth-settings') return WEALTH_TABS
  return FITNESS_TABS
}

export type { View }

interface Props {
  view: View
  setView: (v: View) => void
}

export function NavBar({ view, setView }: Props) {
  const tabs = tabsForView(view)
  const activeIdx = tabs.findIndex((t) => t.id === view)

  return (
    <nav
      role="tablist"
      className="sticky top-0 z-10 flex border-b border-white/[0.06] bg-[rgba(10,10,10,0.88)] pt-[env(safe-area-inset-top)] [backdrop-filter:blur(24px)_saturate(1.5)] [-webkit-backdrop-filter:blur(24px)_saturate(1.5)]"
    >
      {/* Sliding indicator bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: `${100 / tabs.length}%`,
          height: 2,
          background: 'linear-gradient(90deg, transparent 8%, #d4b85a 50%, transparent 92%)',
          boxShadow: '0 0 10px rgba(212,184,90,0.55)',
          transform: `translateX(${activeIdx * 100}%)`,
          transition: 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      />

      {tabs.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
            className={`nav-btn flex min-h-0 min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent pb-[11px] pt-[9px] transition-colors duration-200 ${
              active ? 'text-accent' : 'text-white/[0.28]'
            }`}
            onClick={() => setView(tab.id)}
          >
            <tab.Icon
              size={18}
              strokeWidth={active ? 2.0 : 1.4}
              style={{ transition: 'stroke-width 0.2s ease' }}
            />
            <span
              className={`whitespace-nowrap font-mono text-[9px] uppercase leading-none tracking-[0.07em] ${
                active ? 'font-bold' : 'font-normal'
              }`}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
