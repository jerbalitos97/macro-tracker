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
    <div style={s.navBar}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          style={{
            ...s.navBtn,
            color: view === tab.id ? '#d4b85a' : '#666',
            borderBottom: view === tab.id ? '2px solid #d4b85a' : '2px solid transparent',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
