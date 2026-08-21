import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ALL_TOOLS, effectiveTools, type Tool } from '../lib/roles'
import { ensureAppUser, getMyAppUser, getMyToolsOverride } from '../lib/userTools'
import { useAuth } from './AuthContext'

interface ToolsState {
  tools: Tool[]
  isAdmin: boolean
  loading: boolean
  /** Onko oikeusjärjestelmä ylipäätään käytössä. False = paikallinen asennus
   *  ilman Supabasea, jolloin oikeuksia ei ole mihin verrata. */
  enforced: boolean
  can: (t: Tool) => boolean
  refresh: () => Promise<void>
}

// Oletusarvo koskee vain sitä hetkeä ennen kuin provider on mountattu.
const ToolsContext = createContext<ToolsState>({
  tools: [],
  isAdmin: false,
  loading: true,
  enforced: false,
  can: () => false,
  refresh: async () => {},
})

/**
 * Kolme tilaa, ja ne käyttäytyvät eri tavalla tarkoituksella:
 *
 *  1. Supabase puuttuu kokonaan (env-muuttujat asettamatta). Appi on silloin
 *     yhden ihmisen paikallinen asennus jossa ei ole kirjautumista eikä
 *     pilvidataa — kaikki työkalut ovat auki, kuten ennenkin. Tässä tilassa ei
 *     ole ketään keneltä rajata, ja rajaaminen vain rikkoisi offline-käytön.
 *
 *  2. Supabase on, käyttäjä kirjautunut. Oikeudet luetaan kannasta ja niitä
 *     noudatetaan. Tämä on se tila jossa Anne ja äiti ovat.
 *
 *  3. Supabase on, mutta oikeuksien luku ei onnistu (verkko, RLS, tyhjä rivi).
 *     Fail closed: roles.ts:n suppeat oletukset, ei kaikki. Virhe ei ole lupa.
 */
export function ToolsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const enforced = !!supabase

  const [tools, setTools] = useState<Tool[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(enforced)

  const load = useCallback(async (userId: string, email: string | undefined) => {
    // Näyttönimi omalle riville, jotta admin näkee käyttäjän nimellä. Ei
    // kriittinen — jos tämä ei onnistu, oikeudet luetaan silti.
    await ensureAppUser(userId, email?.split('@')[0] ?? '').catch(() => {})

    const [appUser, override] = await Promise.all([
      getMyAppUser(userId).catch(() => null),
      getMyToolsOverride(userId).catch(() => null),
    ])
    const admin = appUser?.isAdmin ?? false
    setIsAdmin(admin)
    setTools(effectiveTools(admin, override))
  }, [])

  useEffect(() => {
    if (!enforced) {
      // Tila 1 — ei rajausta. Käyttäjien hallinta jätetään silti pois: ilman
      // kirjautumista ei ole tilejä joita hallita, ja tyhjä admin-näkymä on
      // pelkkä umpikuja työkaluruudukossa.
      setTools(ALL_TOOLS.filter((t) => t !== 'admin'))
      setIsAdmin(false)
      setLoading(false)
      return
    }
    if (authLoading) return
    if (!user) {
      setTools([])
      setIsAdmin(false)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    load(user.id, user.email)
      .catch(() => {
        // Tila 3 — fail closed.
        if (!alive) return
        setIsAdmin(false)
        setTools(effectiveTools(false, null))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enforced, authLoading, user, load])

  const refresh = useCallback(async () => {
    if (!enforced || !user) return
    await load(user.id, user.email).catch(() => {})
  }, [enforced, user, load])

  const value = useMemo<ToolsState>(
    () => ({
      tools,
      isAdmin,
      loading,
      enforced,
      can: (t: Tool) => tools.includes(t),
      refresh,
    }),
    [tools, isAdmin, loading, enforced, refresh]
  )

  return <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>
}

export const useTools = () => useContext(ToolsContext)
