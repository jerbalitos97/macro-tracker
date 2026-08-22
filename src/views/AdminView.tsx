import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTools } from '../contexts/ToolsContext'
import { ASSIGNABLE_TOOLS, TOOL_NAMES, defaultToolsFor, type Tool } from '../lib/roles'
import { listAllToolOverrides, listAppUsers, setToolsFor, type AppUser } from '../lib/userTools'

// Työkalujen jako per käyttäjä.
//
// Tämä näkymä EI luo tilejä. Tilin luonti vaatii Supabasen service-role-avaimen,
// jota ei päästetä selaimeen, joten se tehdään Supabasen dashboardista. Kun tili
// on luotu ja käyttäjä on kirjautunut kertaalleen, hän ilmestyy tähän listaan.

const TOOL_COLOR: Record<Tool, string> = {
  habits:   '#a78bfa',
  fitness:  '#22d3ee',
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
  const { isAdmin, refresh } = useTools()

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
    const next = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool]

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

                <div className="mt-3 flex flex-col gap-1.5">
                  {ASSIGNABLE_TOOLS.map((tool) => {
                    const active = list.includes(tool)
                    return (
                      <button
                        key={tool}
                        type="button"
                        disabled={isSaving}
                        onClick={() => void toggle(u, tool)}
                        aria-pressed={active}
                        className={`flex cursor-pointer items-center justify-between rounded-input border px-3 py-2.5 text-left text-[14px] transition-colors disabled:opacity-60 ${
                          active
                            ? 'border-border-hi bg-accent/[0.10] text-text'
                            : 'border-white/[0.08] bg-black/25 text-fg-muted'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: TOOL_COLOR[tool], opacity: active ? 1 : 0.3 }}
                          />
                          <span className={`truncate ${active ? 'font-medium' : ''}`}>{TOOL_NAMES[tool]}</span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            active ? 'border-border-hi bg-accent/[0.18] text-accent' : 'border-white/15 text-transparent'
                          }`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
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
