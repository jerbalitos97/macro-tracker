import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, Eye, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTools } from '../contexts/ToolsContext'
import {
  ASSIGNABLE_TOOLS, FITNESS_SUB_TOOLS, PARENT_TOOLS, TOOL_NAMES,
  defaultToolsFor, effectiveTools, normalizeTools, type Tool,
} from '../lib/roles'
import { listAllToolOverrides, listAppUsers, setToolsFor, type AppUser } from '../lib/userTools'

// Työkalujen jako per käyttäjä.
//
// Tämä näkymä EI luo tilejä. Tilin luonti vaatii Supabasen service-role-avaimen,
// jota ei päästetä selaimeen, joten se tehdään Supabasen dashboardista. Kun tili
// on luotu ja käyttäjä on kirjautunut kertaalleen, hän ilmestyy tähän listaan.

const TOOL_COLOR: Record<Tool, string> = {
  habits:   '#a78bfa',
  fitness:  '#22d3ee',
  'fitness:weight': '#22d3ee',
  'fitness:core':   '#22d3ee',
  'fitness:photo':  '#7dd3fc',
  wealth:   '#34d399',
  workout:  '#60a5fa',
  grocery:  '#f87171',
  plan:     '#e8b85a',
  friday:   '#a78bfa',
  tasks:    '#e8b85a',
  mobility: '#7ba88a',
  admin:    '#9ea2b0',
}

export function AdminView() {
  const { user } = useAuth()
  const { isAdmin, refresh, startViewAs } = useTools()

  const [users, setUsers] = useState<AppUser[]>([])
  const [assigned, setAssigned] = useState<Record<string, Tool[]>>({})
  const [customised, setCustomised] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, overrides] = await Promise.all([listAppUsers(), listAllToolOverrides()])
      const next: Record<string, Tool[]> = {}
      const custom = new Set<string>()
      for (const u of list) {
        const o = overrides[u.userId]
        if (o) {
          next[u.userId] = o
          custom.add(u.userId)
        } else {
          // Näytetään ne oletukset jotka käyttäjä oikeasti saa, jotta rastit
          // vastaavat sitä mitä hän näkee — ei tyhjää listaa.
          next[u.userId] = defaultToolsFor(u.isAdmin).filter((t) => ASSIGNABLE_TOOLS.includes(t))
        }
      }
      setUsers(list)
      setAssigned(next)
      setCustomised(custom)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Haku epäonnistui')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    void load()
  }, [isAdmin, load])

  const toggle = async (u: AppUser, tool: Tool) => {
    const current = assigned[u.userId] ?? []
    const turningOff = current.includes(tool)
    let draft = turningOff ? current.filter((t) => t !== tool) : [...current, tool]

    // Emon pois ottaminen vie lapset mukanaan. normalizeTools tekee tämän myös,
    // mutta tehdään se tässä eksplisiittisesti jotta rastit päivittyvät heti
    // oikein eikä vasta seuraavalla latauksella.
    if (turningOff && tool === 'fitness') {
      draft = draft.filter((t) => !FITNESS_SUB_TOOLS.includes(t))
    }
    // Ydin pois ⇒ kuvalisä pois, koska kuvalisä kirjaa päiväkirjaan.
    if (turningOff && tool === 'fitness:core') {
      draft = draft.filter((t) => t !== 'fitness:photo')
    }
    // Alatyökalu päälle ⇒ emo päälle, muuten valinta ei tarkoita mitään.
    if (!turningOff && FITNESS_SUB_TOOLS.includes(tool) && !draft.includes('fitness')) {
      draft = [...draft, 'fitness']
    }

    // Sama normalisointi kuin ajonaikana: kuvalisä ⇒ ydin, orvot alatyökalut
    // pois. Näin administa ei voi tallentaa yhdistelmää jota ajonaika hylkäisi.
    const next = normalizeTools(draft)

    setAssigned((s) => ({ ...s, [u.userId]: next }))
    setSaving((s) => ({ ...s, [u.userId]: true }))
    setError(null)
    try {
      await setToolsFor(u.userId, next)
      setCustomised((prev) => new Set(prev).add(u.userId))
      setSavedFlash(u.userId)
      window.setTimeout(() => setSavedFlash((c) => (c === u.userId ? null : c)), 1500)
      // Jos muokattiin omaa riviä, oma työkalulista päivittyy heti.
      if (u.userId === user?.id) await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tallennus ei onnistunut')
      setAssigned((s) => ({ ...s, [u.userId]: current }))
    } finally {
      setSaving((s) => ({ ...s, [u.userId]: false }))
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col gap-4 px-5 pt-7">
        <p className="text-[13px] text-fg-muted">Tämä näkymä on vain ylläpitäjälle.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-7">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">Ylläpito</div>
        <h2 className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.015em] text-text">
          Käyttäjäoikeudet
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Valitse mihin työkaluihin kukin pääsee. Muutos tallentuu heti. Tilit luodaan
          Supabasen dashboardista — käyttäjä ilmestyy tähän listaan ensimmäisen kirjautumisen jälkeen.
        </p>
      </div>

      {error && (
        <p role="status" className="card-enter flex items-center gap-2 rounded-row border border-danger/40 bg-danger/[0.08] px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-6 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-fg-ghost">Ladataan…</p>
      ) : users.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-ghost">Ei vielä käyttäjiä.</p>
      ) : (
        <div className="list-stagger flex flex-col gap-3">
          {users.map((u) => {
            const list = assigned[u.userId] ?? []
            const isSaving = saving[u.userId] === true
            const isMe = u.userId === user?.id
            return (
              <div
                key={u.userId}
                className="rounded-panel border border-white/10 bg-[rgba(9,11,20,0.5)] p-4 [backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-display text-[16px] font-semibold text-text">
                      {u.displayName || u.userId.slice(0, 8)}
                    </span>
                    {u.isAdmin && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-hi bg-accent/[0.12] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
                        <ShieldCheck size={10} />
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-ghost">
                    {isSaving
                      ? 'Tallennetaan…'
                      : savedFlash === u.userId
                        ? 'Tallennettu'
                        : customised.has(u.userId)
                          ? 'Mukautettu'
                          : 'Oletukset'}
                  </span>
                </div>

                {u.isAdmin && (
                  <p className="mt-2 text-[12px] text-fg-ghost">
                    Ylläpitäjä pääsee aina hallintaan riippumatta näistä rasteista
                    {isMe ? ' — omaa oikeutta ei voi poistaa' : ''}.
                  </p>
                )}

                {!isMe && (
                  <button
                    type="button"
                    onClick={() =>
                      // Linssi lasketaan samalla säännöllä jolla käyttäjän oma
                      // appi sen laskee: kannan rivi jos on, muuten oletukset.
                      startViewAs(
                        u.displayName || u.userId.slice(0, 8),
                        effectiveTools(u.isAdmin, customised.has(u.userId) ? list : null)
                      )
                    }
                    className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-input border border-violet/40 bg-violet/[0.10] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-violet"
                  >
                    <Eye size={13} />
                    Katso tätä näkymää
                  </button>
                )}

                <div className="mt-3 flex flex-col gap-1.5">
                  {PARENT_TOOLS.map((tool) => {
                    const active = list.includes(tool)
                    return (
                      <div key={tool} className="flex flex-col gap-1.5">
                        <ToolToggle
                          tool={tool}
                          active={active}
                          disabled={isSaving}
                          onToggle={() => void toggle(u, tool)}
                        />
                        {/* Alatyökalut emon sisään, sisennettynä ja vain kun
                            emo on päällä — muuten rastit näyttäisivät
                            valittavilta vaikka ne eivät tarkoita mitään. */}
                        {tool === 'fitness' && active && (
                          <div className="ml-3 flex flex-col gap-1.5 border-l border-white/10 pl-3">
                            {FITNESS_SUB_TOOLS.map((sub) => (
                              <ToolToggle
                                key={sub}
                                tool={sub}
                                active={list.includes(sub)}
                                disabled={isSaving}
                                small
                                onToggle={() => void toggle(u, sub)}
                              />
                            ))}
                            <p className="text-[11px] leading-snug text-fg-ghost">
                              Kuvauslisä kytkee myös ylemmän kohdan päälle — kuvasta tunnistettu
                              annos kirjataan ruokapäiväkirjaan.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ToggleProps {
  tool: Tool
  active: boolean
  disabled: boolean
  small?: boolean
  onToggle: () => void
}

function ToolToggle({ tool, active, disabled, small = false, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={active}
      className={`flex cursor-pointer items-center justify-between rounded-input border px-3 text-left transition-colors disabled:opacity-60 ${
        small ? 'py-2 text-[13px]' : 'py-2.5 text-[14px]'
      } ${
        active
          ? 'border-border-hi bg-accent/[0.10] text-text'
          : 'border-white/[0.08] bg-black/25 text-fg-muted'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="shrink-0 rounded-full"
          style={{
            width: small ? 7 : 10,
            height: small ? 7 : 10,
            background: TOOL_COLOR[tool],
            opacity: active ? 1 : 0.3,
          }}
        />
        <span className={`truncate ${active ? 'font-medium' : ''}`}>{TOOL_NAMES[tool]}</span>
      </span>
      <span
        className={`flex shrink-0 items-center justify-center rounded border ${
          small ? 'h-4 w-4' : 'h-5 w-5'
        } ${active ? 'border-border-hi bg-accent/[0.18] text-accent' : 'border-white/15 text-transparent'}`}
      >
        <Check size={small ? 10 : 12} strokeWidth={3} />
      </span>
    </button>
  )
}
