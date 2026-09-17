import { useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Settings } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { Card, Button } from '../components/ui'
import { getPrefs, savePrefsLocal, syncPrefsCloud, hapticsOn } from '../lib/uiPrefs'
import { setHapticsEnabled, haptic } from '../lib/haptics'

// App-level settings only: backup, storage, account. Goals, training blocks,
// TDEE, the weekly rhythm and the protein target moved to Suunnittelu, where
// they are set against each other instead of in a drawer that knew nothing
// about training.

interface Props {
  settings: Settings
  usedBytes: number
  onExport: () => void
  onImport: (json: string) => void
  user?: User | null
}

const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

export function SettingsView({ usedBytes, onExport, onImport, user }: Props) {
  const { signOut, enabled: authEnabled } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const usedKB = (usedBytes / 1024).toFixed(1)
  const usedPct = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100)
  const storageColorClass = usedPct > 80 ? 'bg-danger' : usedPct > 50 ? 'bg-accent' : 'bg-protein'
  const storageTextClass  = usedPct > 80 ? 'text-danger' : usedPct > 50 ? 'text-accent' : 'text-protein'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text === 'string') onImport(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="px-4 pb-2 pt-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="font-display text-[22px] font-bold tracking-[-0.025em] text-text">Asetukset</div>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-fg-faint">
          Sovelluksen omat asetukset. Tavoitteet, treeniblokit ja perusarvot asetetaan
          Suunnittelu-työkalussa.
        </p>
      </div>

      {/* ── Tuntuma ──────────────────────────────────────────────────── */}
      <HapticsCard userId={user?.id} />

      {/* ── Varmuuskopio ─────────────────────────────────────────────── */}
      <Card variant="glass" className="mt-2.5">
        <div className={cardLabel}>Varmuuskopio</div>
        <div className="mb-3.5">
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="text-muted">Tallennustila käytössä</span>
            <span className={`tabular-nums ${storageTextClass}`}>{usedKB} KB / 5 000 KB</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-[rgba(9,11,20,0.50)]">
            <div
              className={`h-full rounded-sm transition-[width] duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${storageColorClass}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={onExport}>↓ Vie varmuuskopio (JSON)</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button variant="ghost" className="w-full" onClick={() => fileInputRef.current?.click()}>
            ↑ Tuo varmuuskopio (JSON)
          </Button>
        </div>
        <div className="mt-2.5 text-[10px] leading-relaxed text-fg-ghost">
          Tuonti korvaa kaiken nykyisen datan. Vie ensin varmuuskopio ennen tuontia.{'\n'}
          Data säilyy vaikka poistaisit pikakuvakkeen kotinäytöltä — se asuu Safarin
          sivustomuistissa. Poistaminen ei tyhjennä dataa.
        </div>
      </Card>

      {/* ── Pilvitili ───────────────────────────────────────────────── */}
      {authEnabled && (
        <Card variant="glass" className="mt-2.5">
          <div className={cardLabel}>Pilvitili</div>
          {user ? (
            <div>
              <div className="mb-3 text-[12px] text-muted">
                Kirjautunut: <span className="text-accent">{user.email}</span>
              </div>
              <Button variant="ghost" className="w-full text-danger" onClick={() => signOut()}>
                Kirjaudu ulos
              </Button>
            </div>
          ) : (
            <div className="text-[12px] text-fg-ghost">Ei kirjautunut.</div>
          )}
        </Card>
      )}

    </div>
  )
}

/** Tuntopalautteen kytkin.
 *
 *  Kytkin värähtää kun se käännetään päälle — se on samalla ainoa tapa kokeilla
 *  asetusta, ja se kertoo heti myös sen ikävän totuuden jos laite ei osaa
 *  värähtää lainkaan. Pois päin kääntäessä ei värähdetä, koska juuri sitä
 *  pyydettiin. */
function HapticsCard({ userId }: { userId?: string }) {
  const [on, setOn] = useState(() => hapticsOn())

  const toggle = () => {
    const next = !on
    setOn(next)
    setHapticsEnabled(next)
    const prefs = savePrefsLocal({ ...getPrefs(), haptics: next })
    if (userId) syncPrefsCloud(userId, prefs)
    if (next) haptic('toggle')
  }

  return (
    <Card variant="glass" className="mt-2.5">
      <div className={cardLabel}>Tuntuma</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        data-no-haptic
        className="flex w-full items-center justify-between gap-4 bg-transparent p-0 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[13px] text-text">Värähdys painalluksista</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-fg-ghost">
            Lyhyt naksaus napeista ja kuittauksista. Riippuu laitteesta: iPhonella
            palaute tulee järjestelmältä eikä sen voimakkuutta voi säätää, ja
            tietokoneella sitä ei ole lainkaan.
          </span>
        </span>
        <span
          aria-hidden
          className="relative h-[30px] w-[52px] flex-shrink-0 rounded-full border transition-colors duration-200"
          style={{
            backgroundColor: on ? 'rgba(34,211,238,0.30)' : 'rgba(255,255,255,0.06)',
            borderColor: on ? 'rgba(34,211,238,0.55)' : 'rgba(255,255,255,0.12)',
          }}
        >
          <span
            className="absolute top-[3px] h-[22px] w-[22px] rounded-full"
            style={{
              left: on ? 27 : 3,
              backgroundColor: on ? '#22d3ee' : '#9ea2b0',
              boxShadow: on ? '0 0 12px rgba(34,211,238,0.7)' : 'none',
              transition: 'left 320ms var(--spring), background-color 200ms linear',
            }}
          />
        </span>
      </button>
    </Card>
  )
}
