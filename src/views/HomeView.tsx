import { useEffect, useState } from 'react'
import { Activity, ListChecks, Wallet, Dumbbell, ShoppingBasket, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '../components/NavBar'
import { AppMark } from '../components/AppMark'
import { DragItem, useDragReorder, moveById, moveByDelta } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { getPrefs, savePrefsLocal, pullPrefs, syncPrefsCloud, applyOrder } from '../lib/uiPrefs'

interface Tool {
  /** Stable key for the saved order — never rename these. */
  id: string
  label: string
  Icon: LucideIcon
  color: string
  target: View | null     // null = coming soon
  short?: string
}

const TOOLS: Tool[] = [
  { id: 'habits',  label: 'Habit Tracking',   Icon: ListChecks,     color: '#a78bfa', target: 'habits' },
  { id: 'fitness', label: 'Fitness Tracking', Icon: Activity,       color: '#22d3ee', target: 'today' },
  { id: 'wealth',  label: 'Wealth',           Icon: Wallet,         color: '#34d399', target: 'wealth' },
  { id: 'workout', label: 'Workout',          Icon: Dumbbell,       color: '#60a5fa', target: 'workout' },
  { id: 'grocery', label: 'Grocery',          Icon: ShoppingBasket, color: '#f87171', target: 'grocery' },
  { id: 'friday',  label: 'Talk to Friday',   Icon: Sparkles,       color: '#a78bfa', target: null, short: 'Friday' },
]

interface Props {
  setView: (v: View) => void
}

export function HomeView({ setView }: Props) {
  const { user } = useAuth()
  const [order, setOrder] = useState<string[] | undefined>(() => getPrefs().homeToolOrder)

  useEffect(() => {
    if (!user) return
    let alive = true
    pullPrefs(user.id).then((p) => { if (alive) setOrder(p.homeToolOrder) })
    return () => { alive = false }
  }, [user])

  const tools = applyOrder(TOOLS, (t) => t.id, order)

  const persist = (next: Tool[]) => {
    if (next === tools) return
    const ids = next.map((t) => t.id)
    setOrder(ids)
    const prefs = savePrefsLocal({ ...getPrefs(), homeToolOrder: ids })
    if (user) syncPrefsCloud(user.id, prefs)
  }

  const reorder = useDragReorder((fromId, toId) => persist(moveById(tools, fromId, toId)))

  return (
    <div className="flex min-h-dvh flex-col gap-8 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+36px)]">
      {/* Header — app mark + name */}
      <div className="flex items-center gap-3.5">
        <AppMark size={44} />
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.32em] text-white/45">FRIDAY</div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.015em] text-white">Työkalut</h1>
        </div>
      </div>

      {/* Tool grid */}
      <div ref={reorder.containerRef} className="grid grid-cols-2 gap-4">
        {tools.map((tool) => (
          <ToolTile
            key={tool.id}
            tool={tool}
            reorder={reorder}
            onOpen={() => { if (tool.target) setView(tool.target) }}
            onMove={(d) => persist(moveByDelta(tools, tool.id, d))}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto text-center font-mono text-[11px] tracking-[0.02em] text-fg-ghost">
        Pidä pohjassa ja vedä järjestääksesi · asennettavissa PWA:na
      </div>
    </div>
  )
}

interface TileProps {
  tool: Tool
  reorder: ReturnType<typeof useDragReorder>
  onOpen: () => void
  onMove: (delta: -1 | 1) => void
}

function ToolTile({ tool, reorder, onOpen, onMove }: TileProps) {
  const enabled = tool.target !== null

  return (
    <DragItem
      id={tool.id}
      reorder={reorder}
      longPress
      // A disabled tool still reorders — it just doesn't open.
      onActivate={enabled ? onOpen : () => {}}
      onMove={onMove}
      role="button"
      tabIndex={0}
      ariaLabel={enabled ? tool.label : `${tool.label} — tulossa`}
      ariaDisabled={!enabled}
      className={`relative flex aspect-[1/1.08] min-h-0 min-w-0 flex-col items-start justify-between overflow-hidden rounded-tile border p-5 [backdrop-filter:blur(16px)_saturate(160%)] [-webkit-backdrop-filter:blur(16px)_saturate(160%)] ${
        enabled ? 'cursor-pointer' : 'cursor-not-allowed'
      }`}
      style={{
        backgroundColor: enabled ? `${tool.color}14` : 'rgba(255,255,255,0.03)',
        borderColor: enabled ? `${tool.color}38` : 'rgba(255,255,255,0.08)',
        boxShadow: enabled
          ? '0 18px 50px -28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.10)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="flex h-[58px] w-[58px] items-center justify-center rounded-[18px]"
        style={{
          background: enabled
            ? `linear-gradient(135deg, ${tool.color}66, ${tool.color}1f)`
            : 'rgba(255,255,255,0.04)',
          color: enabled ? tool.color : '#5a5c6a',
          boxShadow: enabled ? `0 0 20px ${tool.color}40` : 'none',
        }}
      >
        <tool.Icon size={26} strokeWidth={2} />
      </div>
      <div className={`font-display text-[17px] font-semibold tracking-[-0.01em] ${enabled ? 'text-white' : 'text-fg-ghost'}`}>
        {tool.label}
      </div>
      {!enabled && (
        <div className="absolute right-4 top-4 rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-fg-ghost">
          Tulossa
        </div>
      )}
    </DragItem>
  )
}
