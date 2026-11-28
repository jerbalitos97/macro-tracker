import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Activity, ListChecks, Wallet, Dumbbell, ShoppingBasket, Sparkles, Download, Check, AlertCircle, CalendarRange, CheckSquare, Sprout, ShieldCheck, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '../components/NavBar'
import { AppMark } from '../components/AppMark'
import { FeedbackButton } from '../components/FeedbackSheet'
import { DragItem, useDragReorder, moveById, moveByDelta } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useTools } from '../contexts/ToolsContext'
import type { Tool } from '../lib/roles'
import { getPrefs, savePrefsLocal, pullPrefs, syncPrefsCloud, applyOrder, hapticsOn } from '../lib/uiPrefs'
import { setHapticsEnabled } from '../lib/haptics'
import { exportAll } from '../lib/exportData'
import type { ExportOutcome } from '../lib/exportData'

interface ToolDef {
  /** Stable key for the saved order — never rename these. It doubles as the
   *  permission key, so it must match a `Tool` in lib/roles.ts. */
  id: Tool
  label: string
  Icon: LucideIcon
  /** Tile tone. Material 3 tonal roles in Aurora colours: one hero (the
   *  gradient), two tinted containers, and the rest on the neutral surface so
   *  colour marks importance instead of decorating every tile. */
  tone?: 'hero' | 'violet' | 'amber'
  /** Spans both grid columns (the hero and the planning row). */
  wide?: boolean
  target: View | null     // null = coming soon
  sub?: string
}

const TOOLS: ToolDef[] = [
  { id: 'fitness',  label: 'Fitness',      Icon: Activity,       tone: 'hero', wide: true, target: 'today' },  // kohde ratkaistaan ajossa, ks. targetFor
  { id: 'habits',   label: 'Tavat',        Icon: ListChecks,     tone: 'violet', target: 'habits' },
  { id: 'workout',  label: 'Treeni',       Icon: Dumbbell,       target: 'workout' },
  { id: 'tasks',    label: 'Tehtävät',     Icon: CheckSquare,    target: 'tasks' },
  { id: 'grocery',  label: 'Ostokset',     Icon: ShoppingBasket, target: 'grocery' },
  { id: 'mobility', label: 'Liikkuvuus',   Icon: Sprout,         target: 'mobility' },
  { id: 'wealth',   label: 'Talous',       Icon: Wallet,         target: 'wealth' },
  { id: 'plan',     label: 'Suunnittelu ja asetukset', Icon: CalendarRange, tone: 'amber', wide: true, target: 'planning', sub: 'Blokit, ravintojaksot, perusarvot' },
  { id: 'testi',    label: 'Testi',        Icon: FlaskConical,   target: 'testi' },
  { id: 'friday',   label: 'Talk to Friday', Icon: Sparkles,     target: null },
  { id: 'admin',    label: 'Käyttäjät',    Icon: ShieldCheck,    target: 'admin' },
]

const WEEKDAYS = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai']

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Hyvää yötä'
  if (h < 11) return 'Huomenta'
  if (h < 17) return 'Päivää'
  return 'Hyvää iltaa'
}

interface Props {
  setView: (v: View) => void
  /** Viimeisin työkalunäkymä — palautteen kontekstiksi. */
  lastView?: View
  /** Tämän päivän jäljellä oleva budjetti Fitness-ruutuun; undefined kun
   *  päivällä ei ole tavoitejaksoa (pelkkä kirjaus). */
  fitnessRemaining?: number
}

// Ruudukon porrastettu sisääntulo näytetään kerran per istunto. Koti on
// paluupaikka: jos kortit häivittyisivät esiin joka paluulla, tuttu ruutu
// näyttäisi latautuvan uudelleen joka kerta.
let staggerPlayed = false

export function HomeView({ setView, lastView, fitnessRemaining }: Props) {
  const { user } = useAuth()
  const { tools: granted, loading: toolsLoading, can } = useTools()
  const [order, setOrder] = useState<string[] | undefined>(() => getPrefs().homeToolOrder)

  useEffect(() => {
    if (!user) return
    let alive = true
    pullPrefs(user.id).then((p) => {
      if (!alive) return
      setOrder(p.homeToolOrder)
      // Sama asetus seuraa käyttäjää laitteelta toiselle. Käynnistys luki
      // välimuistin; tämä on ensimmäinen hetki jolloin pilven arvo on tiedossa.
      setHapticsEnabled(hapticsOn(p))
    })
    return () => { alive = false }
  }, [user])

  // Suodatus ennen järjestystä: myöntämätön työkalu ei ole olemassa tällä
  // ruudulla. Piilottaminen ei ole turvaraja — se on RLS ja App.tsx:n portti —
  // mutta kortti jota ei voi avata on pelkkää hämmennystä.
  const visible = TOOLS.filter((t) => granted.includes(t.id))
  const tools = applyOrder(visible, (t) => t.id, order)

  // Fitness on jaettu kahtia, joten kortin kohde riippuu siitä kumpi puoli on
  // myönnetty. Pelkän painonseurannan käyttäjä laskeutuisi muuten `today`hin,
  // josta portti heittäisi hänet takaisin kotiin — kortti joka ei tee mitään.
  const targetFor = (tool: ToolDef): View | null => {
    if (tool.id !== 'fitness') return tool.target
    if (granted.includes('fitness:core')) return 'today'
    if (granted.includes('fitness:weight')) return 'weight'
    return null
  }

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

  const [stagger] = useState(() => !staggerPlayed)
  useEffect(() => { staggerPlayed = true }, [])

  const now = new Date()
  const reorder = useDragReorder((fromId, toId) => persist(moveById(tools, fromId, toId)))

  return (
    <div className="flex min-h-dvh flex-col gap-6 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+56px)]">
      {/* Päivä ja tervehdys: M3 display-otsikko, ei logoa eikä isoja kirjaimia. */}
      <div className="flex items-center gap-4 px-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[16px] leading-6 text-fg-muted">
            {WEEKDAYS[now.getDay()]} {now.getDate()}.{now.getMonth() + 1}.
          </p>
          <h1 className="text-[36px] font-medium leading-[44px] text-text">{greeting(now)}</h1>
        </div>
        <AppMark size={44} />
      </div>

      {/* Tool grid */}
      {toolsLoading && tools.length === 0 && (
        <p className="py-6 text-center text-[14px] text-fg-muted">
          Ladataan työkaluja…
        </p>
      )}
      <div ref={reorder.containerRef} role="region" aria-label="Työkalut" className={`${stagger ? 'list-stagger ' : ''}grid grid-flow-row-dense grid-cols-2 gap-3`}>
        {tools.map((tool) => (
          <ToolTile
            key={tool.id}
            tool={tool}
            resolvedTarget={targetFor(tool)}
            detail={tool.id === 'fitness' && fitnessRemaining !== undefined
              ? `${Math.round(fitnessRemaining).toLocaleString('fi-FI')} kcal ${fitnessRemaining < 0 ? 'yli' : 'jäljellä'}`
              : undefined}
            reorder={reorder}
            onOpen={() => {
              const t = targetFor(tool)
              if (t) setView(t)
            }}
            onMove={(d) => persist(moveByDelta(tools, tool.id, d))}
          />
        ))}
      </div>

      {/* Export */}
      {/* Vienti on ylläpitäjän työkalu: tiedosto kootaan kutsujan omasta
          datasta, mutta se on koko tavoite- ja tulosaineisto yhtenä
          jaettavana tiedostona, eikä se ole mitään mitä Anne tai äiti
          tarvitsee. Portti on `can('admin')` eikä `isAdmin`, jotta nappi
          katoaa myös view-as-tilassa — muuten linssi näyttäisi jotain mitä
          se käyttäjä ei oikeasti näe. */}
      {can('admin') && <ExportButton userId={user?.id} />}

      <FeedbackButton lastView={lastView} />

      {/* Footer */}
      <div className="mt-auto text-center text-[12px] leading-4 text-fg-muted">
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
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[0.18] text-[14px] font-semibold text-text disabled:opacity-60"
      >
        <Download size={15} />
        {busy ? 'Kootaan…' : 'Vie kaikki tiedot (JSON)'}
      </button>
      {outcome && (
        <p
          role="status"
          className={`view-enter mt-1.5 flex items-center justify-center gap-1.5 text-center text-[12px] ${
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
  /** Ratkaistu kohde — Fitnessillä se riippuu myönnetystä puolesta. */
  resolvedTarget: View | null
  /** Toissijainen tieto ruudun alareunaan (Fitnessillä päivän budjetti). */
  detail?: string
  reorder: ReturnType<typeof useDragReorder>
  onOpen: () => void
  onMove: (delta: -1 | 1) => void
}

// Tonal containers from the design: the hero carries the Aurora gradient, two
// tools get a tinted container, everything else sits on surface-2.
const TONE: Record<NonNullable<ToolDef['tone']> | 'neutral', { className: string; style?: CSSProperties }> = {
  hero: {
    className: 'rounded-[28px] border border-cyan/35 text-white',
    style: { background: 'linear-gradient(135deg, rgba(34,211,238,0.30), rgba(167,139,250,0.26))' },
  },
  violet: { className: 'rounded-[24px] bg-violet/[0.24] text-[#ede9fe]' },
  amber: { className: 'rounded-[24px] bg-[rgba(232,184,90,0.18)] text-[#f5e6c4]' },
  neutral: { className: 'rounded-[24px] bg-[var(--surface-2)] text-text' },
}

function ToolTile({ tool, resolvedTarget, detail, reorder, onOpen, onMove }: TileProps) {
  const enabled = resolvedTarget !== null
  const tone = TONE[tool.tone ?? 'neutral']
  const row = tool.wide && tool.tone !== 'hero'

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
      className={`relative flex min-w-0 overflow-hidden ${tone.className} ${
        tool.wide ? 'col-span-2' : ''
      } ${
        row
          ? 'min-h-20 flex-row items-center gap-3.5 p-4'
          : tool.tone === 'hero'
            ? 'min-h-[132px] flex-col justify-between p-5'
            : 'min-h-[112px] flex-col justify-between p-4'
      } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}
      style={tone.style}
    >
      <tool.Icon size={tool.tone === 'hero' ? 28 : 24} strokeWidth={2} aria-hidden />
      {row ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[16px] font-medium leading-6">{tool.label}</span>
          {tool.sub && <span className="text-[12px] leading-4 text-[#e7dcc3]">{tool.sub}</span>}
        </span>
      ) : (
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className={tool.tone === 'hero' ? 'text-[22px] font-medium leading-7' : 'text-[16px] font-medium leading-6'}>
            {tool.label}
          </span>
          {detail && <span className="text-[16px] leading-6 tabular-nums">{detail}</span>}
        </span>
      )}
      {!enabled && (
        <span className="absolute right-3 top-3 rounded-lg bg-[var(--surface-3)] px-2 py-1 text-[12px] leading-4 text-fg-muted">
          Tulossa
        </span>
      )}
    </DragItem>
  )
}
