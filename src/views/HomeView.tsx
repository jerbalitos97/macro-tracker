import { Activity, ListChecks, Wallet, Dumbbell, ShoppingBasket, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '../components/NavBar'
import { MimirMark } from '../components/MimirMark'

interface Tool {
  label: string
  Icon: LucideIcon
  color: string
  target: View | null     // null = coming soon
  short?: string
}

const TOOLS: Tool[] = [
  { label: 'Habit Tracking',    Icon: ListChecks,     color: '#c98ad4', target: 'habits' },
  { label: 'Fitness Tracking',  Icon: Activity,       color: '#d4b85a', target: 'today' },
  { label: 'Wealth',            Icon: Wallet,         color: '#8acb88', target: null,    short: 'Wealth' },
  { label: 'Workout',           Icon: Dumbbell,       color: '#6a9ad4', target: null,    short: 'Workout' },
  { label: 'Grocery',           Icon: ShoppingBasket, color: '#e87a6a', target: null,    short: 'Grocery' },
  { label: 'Jarvis',            Icon: Sparkles,       color: '#9d8ad4', target: null,    short: 'Jarvis' },
]

interface Props {
  setView: (v: View) => void
}

export function HomeView({ setView }: Props) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        padding: 'calc(env(safe-area-inset-top) + 36px) 20px calc(env(safe-area-inset-bottom) + 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {/* Header — inline Mimir mark + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <MimirMark size={44} />
        <div>
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.32em',
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              marginBottom: 4,
            }}
          >
            MIMIR
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.015em', color: '#fff' }}>
            Työkalut
          </h1>
        </div>
      </div>

      {/* Tool grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
        }}
      >
        {TOOLS.map((tool) => (
          <ToolTile key={tool.label} tool={tool} setView={setView} />
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
        Pidä pohjassa ja vedä järjestääksesi · asennettavissa PWA:na
      </div>
    </div>
  )
}

function ToolTile({ tool, setView }: { tool: Tool; setView: (v: View) => void }) {
  const enabled = tool.target !== null
  const handle = () => {
    if (enabled && tool.target) setView(tool.target)
  }
  return (
    <button
      onClick={handle}
      disabled={!enabled}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '24px 12px 16px',
        borderRadius: 18,
        backgroundColor: enabled ? `${tool.color}14` : 'rgba(255,255,255,0.03)',
        border: enabled ? `1px solid ${tool.color}33` : '1px solid rgba(255,255,255,0.05)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        color: 'inherit',
        fontFamily: 'inherit',
        minHeight: 'auto',
        minWidth: 'auto',
        opacity: enabled ? 1 : 0.55,
        transition: 'transform 0.18s ease, background-color 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: enabled ? `${tool.color}22` : 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: enabled ? tool.color : 'rgba(255,255,255,0.4)',
        }}
      >
        <tool.Icon size={26} strokeWidth={1.8} />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: enabled ? '#fff' : 'rgba(255,255,255,0.5)',
          letterSpacing: '-0.005em',
          textAlign: 'center',
        }}
      >
        {tool.label}
      </div>
      {!enabled && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 8,
            color: 'rgba(255,255,255,0.5)',
            backgroundColor: 'rgba(255,255,255,0.08)',
            padding: '2px 6px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontWeight: 600,
          }}
        >
          Tulossa
        </div>
      )}
    </button>
  )
}
