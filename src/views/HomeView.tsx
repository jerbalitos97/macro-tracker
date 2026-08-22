import { useEffect, useState } from 'react'
import { Activity, ListChecks, Wallet, Dumbbell, ShoppingBasket, Sparkles, Download, Check, AlertCircle, CalendarRange, CheckSquare, Sprout, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '../components/NavBar'
import { AppMark } from '../components/AppMark'
import { DragItem, useDragReorder, moveById, moveByDelta } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useTools } from '../contexts/ToolsContext'
import type { Tool } from '../lib/roles'
import { getPrefs, savePrefsLocal, pullPrefs, syncPrefsCloud, applyOrder } from '../lib/uiPrefs'
import { exportAll } from '../lib/exportData'
import type { ExportOutcome } from '../lib/exportData'

interface ToolDef {
  /** Stable key for the saved order — never rename these. It doubles as the
   *  permission key, so it must match a `Tool` in lib/roles.ts. */
  id: Tool
  label: string
  Icon: LucideIcon
  color: string
  target: View | null     // null = coming soon
  short?: string
}

const TOOLS: ToolDef[] = [
  { id: 'habits',   label: 'Habit Tracking',   Icon: ListChecks,     color: '#a78bfa', target: 'habits' },
  { id: 'fitness',  label: 'Fitness Tracking', Icon: Activity,       color: '#22d3ee', target: 'today' },
  { id: 'wealth',   label: 'Wealth',           Icon: Wallet,         color: '#34d399', target: 'wealth' },
  { id: 'workout',  label: 'Workout',          Icon: Dumbbell,       color: '#60a5fa', target: 'workout' },
  { id: 'grocery',  label: 'Grocery',          Icon: ShoppingBasket, color: '#f87171', target: 'grocery' },
  { id: 'plan',     label: 'Suunnittelu',      Icon: CalendarRange,  color: '#e8b85a', target: 'planning' },
  { id: 'tasks',    label: 'Tehtävät',         Icon: CheckSquare,    color: '#e8b85a', target: 'tasks' },
  { id: 'mobility', label: 'LiikkuvuusPuu',    Icon: Sprout,         color: '#7ba88a', target: 'mobility', short: 'Liikkuvuus' },
  { id: 'friday',   label: 'Talk to Friday',   Icon: Sparkles,       color: '#a78bfa', target: null, short: 'Friday' },
  { id: 'admin',    label: 'Käyttäjät',        Icon: ShieldCheck,    color: '#9ea2b0', target: 'admin' },
]

interface Props {
  setView: (v: View) => void
}

export function HomeView({ setView }: Props) {
  const { user } = useAuth()
  const { tools: granted, loading: toolsLoading } = useTools()
  const [order, setOrder] = useState<string[] | undefined>(() => getPrefs().homeToolOrder)

  useEffect(() => {
    if (!user) return
    let alive = true
    pullPrefs(user.id).then((p) => { if (alive) setOrder(p.homeToolOrder) })
    return () => { alive = false }
  }, [user])

  // Suodatus ennen järjestystä: myöntämätön työkalu ei ole olemassa tällä
  // ruudulla. Piilottaminen ei ole turvaraja — se on RLS ja App.tsx:n portti —
  // mutta kortti jota ei voi avata on pelkkää hämmennystä.
  const visible = TOOLS.filter((t) => granted.includes(t.id))
  const tools = applyOrder(visible, (t) => t.id, order)

  const persist = (next: ToolDef[]) => {
    if (next === tools) return
    // Vain näkyvät kortit järjestyvät, mutta tallennettuun listaan jätetään myös
    // piilossa olevien id:t. Ilman tätä myöntämättömän työkalun id katoaisi
    // listalta joka kerta kun ruudukkoa järjestetään, ja työkalu ilmestyisi
    // myöhemmin myönnettäessä aina loppuun applyOrderin oletuksena.
    const visibleIds: string[] = next.map((t) => t.id)
    const hidden = (order ?? []).filter((id) => !visibleIds.includes(id))
    const ids = [...visibleIds, ...hidden]
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
          <div className="mb-1 font-mono text-[10px] tracking-[0.32em] text-fg-muted">FRIDAY</div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.015em] text-white">Työkalut</h1>
        </div>
      </div>

      {/* Tool grid */}
      {toolsLoading && tools.length === 0 && (
        <p className="py-6 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-fg-ghost">
          Ladataan työkaluja…
        </p>
      )}
      <div ref={reorder.containerRef} className="list-stagger grid grid-cols-2 gap-4">
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

      {/* Export */}
      <ExportButton userId={user?.id} />

      {/* Footer */}
      <div className="mt-auto text-center font-mono text-[11px] tracking-[0.02em] text-fg-ghost">
        Pidä pohjassa ja vedä järjestääksesi · asennettavissa PWA:na
      </div>
    </div>
  )
}

const OUTCOME_TEXT: Record<ExportOutcome, string> = {
  shared: 'Jaettu',
  downloaded: 'Ladattu',
  cancelled: 'Peruttu',
  'no-data': 'Ei vielä dataa vietäväksi',
  failed: 'Vienti ei onnistunut',
}

function ExportButton({ userId }: { userId?: string }) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null)

  const run = async () => {
    setBusy(true)
    setOutcome(null)
    const r = await exportAll(userId)
    setOutcome(r)
    setBusy(false)
    window.setTimeout(() => setOutcome(null), 4000)
  }

  const bad = outcome === 'failed' || outcome === 'no-data'

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-row border border-white/10 bg-[rgba(9,11,20,0.48)] py-3.5 font-mono text-[12px] uppercase tracking-[0.08em] text-fg-dim [backdrop-filter:blur(14px)] disabled:opacity-60"
      >
        <Download size={15} />
        {busy ? 'Kootaan…' : 'Vie tavoite- ja tulosdata'}
      </button>
      {outcome && (
        <p
          role="status"
          className={`view-enter mt-1.5 flex items-center justify-center gap-1.5 text-center text-[11px] ${
            bad ? 'text-danger' : 'text-fg-muted'
          }`}
        >
          {bad ? <AlertCircle size={12} /> : <Check size={12} />}
          {OUTCOME_TEXT[outcome]}
        </p>
      )}
    </div>
  )
}

interface TileProps {
  tool: ToolDef
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
        <div className="absolute right-4 top-4 rounded-lg bg-[rgba(9,11,20,0.50)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-fg-ghost">
          Tulossa
        </div>
      )}
    </DragItem>
  )
}
