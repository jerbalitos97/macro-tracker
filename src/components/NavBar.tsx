import { Home, CalendarDays, TrendingDown, BarChart2, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type View = 'today' | 'calendar' | 'weight' | 'history' | 'settings'

interface Tab {
  id: View
  label: string
  Icon: LucideIcon
}

const TABS: Tab[] = [
  { id: 'today',    label: 'Tänään',    Icon: Home },
  { id: 'calendar', label: 'Kalenteri', Icon: CalendarDays },
  { id: 'weight',   label: 'Paino',     Icon: TrendingDown },
  { id: 'history',  label: 'Trendit',   Icon: BarChart2 },
  { id: 'settings', label: 'Asetukset', Icon: SlidersHorizontal },
]

interface Props {
  view: View
  setView: (v: View) => void
}

export function NavBar({ view, setView }: Props) {
  const activeIdx = TABS.findIndex((t) => t.id === view)

  return (
    <nav
      role="tablist"
      style={{
        display: 'flex',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: 'rgba(10,10,10,0.88)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Sliding indicator bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: `${100 / TABS.length}%`,
          height: 2,
          background: 'linear-gradient(90deg, transparent 8%, #d4b85a 50%, transparent 92%)',
          boxShadow: '0 0 10px rgba(212,184,90,0.55)',
          transform: `translateX(${activeIdx * 100}%)`,
          transition: 'transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      />

      {TABS.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
            className="nav-btn"
            onClick={() => setView(tab.id)}
            style={{
              flex: 1,
              padding: '9px 0 11px',
              backgroundColor: 'transparent',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              color: active ? '#d4b85a' : 'rgba(255,255,255,0.28)',
              minWidth: 'auto',
              minHeight: 'auto',
              transition: 'color 0.22s ease',
            }}
          >
            <tab.Icon
              size={18}
              strokeWidth={active ? 2.0 : 1.4}
              style={{ transition: 'stroke-width 0.2s ease' }}
            />
            <span
              style={{
                fontSize: 9,
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                fontWeight: active ? 700 : 400,
                lineHeight: 1,
                transition: 'font-weight 0.2s ease',
              }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
