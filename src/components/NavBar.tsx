import { s } from '../styles/tokens'

type View = 'today' | 'calendar' | 'weight' | 'history' | 'settings'

interface Props {
  view: View
  setView: (v: View) => void
}

const TABS: { id: View; label: string }[] = [
  { id: 'today', label: 'Tänään' },
  { id: 'calendar', label: 'Kalenteri' },
  { id: 'weight', label: 'Paino' },
  { id: 'history', label: 'Trendit' },
  { id: 'settings', label: 'Asetukset' },
]

export function NavBar({ view, setView }: Props) {
  return (
    <nav style={s.navBar}>
      {TABS.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              ...s.navBtn,
              color: active ? '#d4b85a' : '#555',
              backgroundColor: active ? 'rgba(212,184,90,0.07)' : 'transparent',
              borderBottom: active ? '2px solid #d4b85a' : '2px solid transparent',
              transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
              // override global button active scale so nav doesn't jiggle
              fontWeight: active ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
