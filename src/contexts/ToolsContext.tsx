import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ALL_TOOLS, effectiveTools, parseTools, type Tool } from '../lib/roles'
import { ensureAppUser, getMyAppUser, getMyToolsOverride } from '../lib/userTools'
import { useAuth } from './AuthContext'

interface ViewAs {
  /** Kenenä katsotaan — näyttönimi banneria varten. */
  name: string
  /** Sen käyttäjän työkalulinssi. */
  tools: Tool[]
}

interface ToolsState {
  tools: Tool[]
  isAdmin: boolean
  loading: boolean
  /** Onko oikeusjärjestelmä ylipäätään käytössä. False = paikallinen asennus
   *  ilman Supabasea, jolloin oikeuksia ei ole mihin verrata. */
  enforced: boolean
  can: (t: Tool) => boolean
  refresh: () => Promise<void>
  /** Adminin "katso käyttäjän silmin" -tila. TYÖKALULINSSI, ei datalinssi:
   *  vaihtaa mitkä kortit ja näkymät näkyvät, mutta jokainen kysely kulkee
   *  yhä omalla sessiollasi ja RLS näyttää vain omat rivisi. Toisen dataa
   *  tällä ei näe — se raja on kannassa, eikä tämä tila kosketa sitä. */
  viewAs: ViewAs | null
  startViewAs: (name: string, tools: Tool[]) => void
  stopViewAs: () => void
}

// Oletusarvo koskee vain sitä hetkeä ennen kuin provider on mountattu.
const ToolsContext = createContext<ToolsState>({
  tools: [],
  isAdmin: false,
  loading: true,
  enforced: false,
  can: () => false,
  refresh: async () => {},
  viewAs: null,
  startViewAs: () => {},
  stopViewAs: () => {},
})

// ── Välimuisti ───────────────────────────────────────────────
// Ilman tätä jokainen avaus odottaa verkkokierroksen ennen kuin ruudukko
// piirtyy, ja appi näyttää lataavan itseään. Työkalulista muuttuu vain kun
// admin rastittaa jotain, joten eilinen lista on käytännössä aina oikea:
// näytetään se heti ja päivitetään taustalla (stale-while-revalidate).
//
// Tämä on käyttöliittymän välimuisti, ei oikeuspäätös — vanhentunut lista
// näyttää korkeintaan kortin jonka näkymä on tyhjä, koska RLS ei anna riviäkään.
const CACHE_KEY = 'friday.tools:v1'

interface CachedTools {
  userId: string
  tools: Tool[]
  isAdmin: boolean
}

function readCache(userId: string): CachedTools | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedTools
    if (parsed.userId !== userId) return null
    const tools = parseTools(parsed.tools)
    if (!tools) return null
    return { userId, tools, isAdmin: parsed.isAdmin === true }
  } catch {
    return null
  }
}

function writeCache(c: CachedTools): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* täysi tai estetty storage ei ole virhe */
  }
}

const sameTools = (a: Tool[], b: Tool[]) => a.length === b.length && a.every((t, i) => t === b[i])

/**
 * Kolme tilaa, ja ne käyttäytyvät eri tavalla tarkoituksella:
 *
 *  1. Supabase puuttuu kokonaan (env-muuttujat asettamatta). Appi on silloin
 *     yhden ihmisen paikallinen asennus jossa ei ole kirjautumista eikä
 *     pilvidataa — kaikki työkalut ovat auki, kuten ennenkin.
 *
 *  2. Supabase on, käyttäjä kirjautunut. Välimuistista heti, kannasta perään.
 *
 *  3. Supabase on, mutta oikeuksien luku ei onnistu (verkko, RLS, tyhjä rivi)
 *     eikä välimuistia ole. Fail closed: suppeat oletukset, ei kaikki.
 */
export function ToolsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const enforced = !!supabase

  const [tools, setTools] = useState<Tool[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(enforced)
  const [viewAs, setViewAs] = useState<ViewAs | null>(null)

  const load = useCallback(async (userId: string, email: string | undefined) => {
    // Näyttönimen ylläpito EI ole latauspolulla. Se oli: yksi tai kaksi
    // verkkokierrosta ennen kuin varsinaista oikeuskyselyä edes aloitettiin,
    // ja koko appi odotti sitä. Nyt se kulkee rinnalla omia aikojaan.
    void ensureAppUser(userId, email?.split('@')[0] ?? '').catch(() => {})

    const [appUser, override] = await Promise.all([
      getMyAppUser(userId).catch(() => null),
      getMyToolsOverride(userId).catch(() => null),
    ])
    const admin = appUser?.isAdmin ?? false
    const next = effectiveTools(admin, override)
    writeCache({ userId, tools: next, isAdmin: admin })
    // Päivitetään tila vain jos jokin muuttui — turha setState käynnistäisi
    // renderin (ja sen mukana mount-animaatiot uudelleen) joka avauksella.
    setIsAdmin((prev) => (prev === admin ? prev : admin))
    setTools((prev) => (sameTools(prev, next) ? prev : next))
  }, [])

  useEffect(() => {
    if (!enforced) {
      // Tila 1 — ei rajausta. Käyttäjien hallinta jätetään silti pois: ilman
      // kirjautumista ei ole tilejä joita hallita.
      setTools(ALL_TOOLS.filter((t) => t !== 'admin'))
      setIsAdmin(false)
      setLoading(false)
      return
    }
    if (authLoading) return
    if (!user) {
      setTools([])
      setIsAdmin(false)
      setViewAs(null)
      setLoading(false)
      return
    }

    let alive = true

    // Välimuisti ensin: ruudukko piirtyy heti, kanta vahvistaa taustalla.
    const cached = readCache(user.id)
    if (cached) {
      setTools(cached.tools)
      setIsAdmin(cached.isAdmin)
      setLoading(false)
    } else {
      setLoading(true)
    }

    load(user.id, user.email)
      .catch(() => {
        // Tila 3 — fail closed, mutta vain jos välimuistikaan ei kantanut.
        if (!alive || cached) return
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

  // View-as elää vain muistissa. Tarkoituksella ei localStoragea: reload
  // palauttaa aina omaan näkymään, joten "voin aina palata omaani" ei ole
  // minkään tallennetun tilan varassa.
  const startViewAs = useCallback((name: string, lensTools: Tool[]) => {
    setViewAs({ name, tools: lensTools.filter((t) => t !== 'admin') })
  }, [])
  const stopViewAs = useCallback(() => setViewAs(null), [])

  const effective = viewAs ? viewAs.tools : tools

  const value = useMemo<ToolsState>(
    () => ({
      tools: effective,
      isAdmin,
      loading,
      enforced,
      can: (t: Tool) => effective.includes(t),
      refresh,
      viewAs,
      startViewAs,
      stopViewAs,
    }),
    [effective, isAdmin, loading, enforced, refresh, viewAs, startViewAs, stopViewAs]
  )

  return <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>
}

export const useTools = () => useContext(ToolsContext)
