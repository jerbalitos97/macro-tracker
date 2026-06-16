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
  { label: 'Wealth',            Icon: Wallet,         color: '#8acb88', target: 'wealth' },
  { label: 'Workout',           Icon: Dumbbell,       color: '#6a9ad4', target: null,    short: 'Workout' },
  { label: 'Grocery',           Icon: ShoppingBasket, color: '#e87a6a', target: null,    short: 'Grocery' },
  { label: 'Jarvis',            Icon: Sparkles,       color: '#9d8ad4', target: null,    short: 'Jarvis' },
]

interface Props {
  setView: (v: View) => void
}

export function HomeView({ setView }: Props) {
  return (
    <div className="flex min-h-dvh flex-col gap-8 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+36px)]">
      {/* Header — inline Mimir mark + name */}
      <div className="flex items-center gap-3.5">
        <MimirMark size={44} />
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.32em] text-white/45">MIMIR</div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.015em] text-white">Työkalut</h1>
        </div>
      </div>

      {/* Tool grid */}
      <div className="grid grid-cols-2 gap-3.5">
        {TOOLS.map((tool) => (
          <ToolTile key={tool.label} tool={tool} setView={setView} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto text-center text-[11px] text-white/[0.28]">
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
      className="relative flex min-h-0 min-w-0 flex-col items-center gap-3 overflow-hidden rounded-[20px] border px-3 pb-4 pt-6 [backdrop-filter:blur(20px)_saturate(160%)] [-webkit-backdrop-filter:blur(20px)_saturate(160%)] disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        backgroundColor: enabled ? `${tool.color}14` : 'rgba(255,255,255,0.03)',
        borderColor: enabled ? `${tool.color}33` : 'rgba(255,255,255,0.06)',
        boxShadow: enabled
          ? '0 18px 50px -28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.10)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[14px]"
        style={{
          backgroundColor: enabled ? `${tool.color}22` : 'rgba(255,255,255,0.04)',
          color: enabled ? tool.color : 'rgba(255,255,255,0.4)',
        }}
      >
        <tool.Icon size={26} strokeWidth={1.8} />
      </div>
      <div className={`font-display text-[13px] font-semibold tracking-[-0.005em] ${enabled ? 'text-white' : 'text-white/50'}`}>
        {tool.label}
      </div>
      {!enabled && (
        <div className="absolute right-2 top-2 rounded font-mono text-[8px] font-semibold uppercase tracking-[0.1em] bg-white/[0.08] px-1.5 py-0.5 text-white/50">
          Tulossa
        </div>
      )}
    </button>
  )
}
