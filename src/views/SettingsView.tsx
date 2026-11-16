import { useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Settings } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { Sheet } from '../components/ui'
import { ChevronRight, Download, Lock, LogOut, Upload, UserRound, Vibrate } from 'lucide-react'
import { LockSetup } from '../components/AppLock'
import { clearLock, getLock } from '../lib/appLock'
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

const sectionHead = 'flex min-h-11 items-center px-1 pt-2'
const sectionTitle = 'm-0 text-[18px] font-medium leading-6 text-text'
const listGroup = 'flex flex-col gap-0.5 overflow-hidden rounded-[24px]'
const listRow =
  'flex min-h-16 w-full items-center gap-3.5 bg-[var(--surface-1)] px-4 py-2.5 text-left text-text'
const rowTitle = 'block text-[16px] leading-6'
const rowMeta = 'block text-[14px] leading-5 text-fg-muted'
const textBtn =
  'inline-flex min-h-11 items-center rounded-full bg-transparent px-3 text-[14px] font-semibold text-[#22d3ee]'

/** 40px tonal icon disc at the start of a list row. */
function RowIcon({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
        danger ? 'bg-[rgba(255,180,171,0.14)] text-[#FFB4AB]' : 'bg-[rgba(232,184,90,0.16)] text-[#f5e6c4]'
      }`}
    >
      {children}
    </span>
  )
}

export function SettingsView({ usedBytes, onExport, onImport, user }: Props) {
  const { signOut, enabled: authEnabled } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const usedKB = (usedBytes / 1024).toFixed(1)
  const usedPct = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100)
  const storageColorClass = usedPct > 80 ? 'bg-danger' : usedPct > 50 ? 'bg-accent' : 'bg-protein'
  const storageTextClass  = usedPct > 80 ? 'text-danger' : usedPct > 50 ? 'text-accent' : 'text-fg-muted'

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
    <div className="flex flex-col gap-2 px-4 pb-2 pt-2">
      <p className="m-0 px-1 text-[14px] leading-5 text-fg-muted">
        Sovelluksen omat asetukset. Tavoitteet, treeniblokit ja perusarvot asetetaan
        Suunnittelu-työkalussa.
      </p>

      {/* ── Tuntuma ──────────────────────────────────────────────────── */}
      <div className={sectionHead}>
        <h2 className={sectionTitle}>Tuntuma</h2>
      </div>
      <div className={listGroup}>
        <HapticsRow userId={user?.id} />
      </div>

      {/* ── Tiedot ───────────────────────────────────────────────────── */}
      <div className={sectionHead}>
        <h2 className={sectionTitle}>Tiedot</h2>
      </div>
      <div className={listGroup}>
        <div className={`${listRow} flex-col !items-stretch gap-2`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={rowTitle}>Tallennustila</span>
            <span className={`font-mono text-[14px] ${storageTextClass}`}>{usedKB} KB / 5 000 KB</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-white/[0.12]">
            <div
              className={`h-full rounded-[3px] transition-[width] duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${storageColorClass}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
        <button type="button" className={listRow} onClick={onExport}>
          <RowIcon><Download size={20} /></RowIcon>
          <span className="min-w-0 flex-1">
            <span className={rowTitle}>Vie varmuuskopio</span>
            <span className={rowMeta}>JSON-tiedosto kaikesta datasta</span>
          </span>
          <ChevronRight size={20} className="flex-none text-fg-muted" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button type="button" className={listRow} onClick={() => fileInputRef.current?.click()}>
          <RowIcon><Upload size={20} /></RowIcon>
          <span className="min-w-0 flex-1">
            <span className={rowTitle}>Tuo varmuuskopio</span>
            <span className={rowMeta}>Korvaa kaikki nykyiset tiedot</span>
          </span>
          <ChevronRight size={20} className="flex-none text-fg-muted" />
        </button>
      </div>
      <p className="m-0 px-1 text-[14px] leading-5 text-fg-muted">
        Tuonti korvaa kaiken nykyisen datan. Vie ensin varmuuskopio ennen tuontia.
        Data säilyy vaikka poistaisit pikakuvakkeen kotinäytöltä — se asuu Safarin
        sivustomuistissa. Poistaminen ei tyhjennä dataa.
      </p>

      {/* ── Tili ─────────────────────────────────────────────────────── */}
      {authEnabled && (
        <>
          <div className={sectionHead}>
            <h2 className={sectionTitle}>Tili</h2>
          </div>
          <div className={listGroup}>
            <div className={listRow}>
              <RowIcon><UserRound size={20} /></RowIcon>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Pilvitili</span>
                <span className={`${rowMeta} truncate`}>{user ? user.email : 'Ei kirjautunut.'}</span>
              </span>
            </div>
            {user && (
              <>
                <LockSettings userId={user.id} label={user.email ?? 'Friday'} />
                <button type="button" className={`${listRow} !text-[#FFB4AB]`} onClick={() => signOut()}>
                  <RowIcon danger><LogOut size={20} /></RowIcon>
                  <span className={`${rowTitle} flex-1`}>Kirjaudu ulos</span>
                </button>
              </>
            )}
          </div>
        </>
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
function HapticsRow({ userId }: { userId?: string }) {
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      data-no-haptic
      className={listRow}
    >
      <RowIcon><Vibrate size={20} /></RowIcon>
      <span className="min-w-0 flex-1">
        <span className={rowTitle}>Värähdys painalluksista</span>
        <span className={rowMeta}>
          Lyhyt naksaus napeista ja kuittauksista. Riippuu laitteesta: iPhonella
          palaute tulee järjestelmältä eikä sen voimakkuutta voi säätää, ja
          tietokoneella sitä ei ole lainkaan.
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-[52px] flex-none rounded-full transition-colors duration-200 ${
          on ? 'bg-gradient-to-br from-[#e8b85a] to-[#a78bfa]' : 'border-2 border-[#899294] bg-[var(--surface-2)]'
        }`}
      >
        <span
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
          style={{
            left: on ? 26 : 4,
            backgroundColor: on ? '#05060c' : '#899294',
            transition: 'left 320ms var(--spring), background-color 200ms linear',
          }}
        />
      </span>
    </button>
  )
}

// Sovelluslukko: laitekohtainen, ks. lib/appLock.ts.
function LockSettings({ userId, label }: { userId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(() => getLock(userId))
  const close = () => {
    setOpen(false)
    setConfig(getLock(userId))
  }
  const status = !config
    ? 'Ei käytössä'
    : [config.credentialId && 'tunnistus', config.pin && 'PIN'].filter(Boolean).join(' + ')

  return (
    <div className={listRow}>
      <RowIcon><Lock size={20} /></RowIcon>
      <span className="min-w-0 flex-1">
        <span className={rowTitle}>Sovelluslukko</span>
        <span className={rowMeta}>{status}</span>
      </span>
      <span className="flex shrink-0 gap-0.5">
        {config && (
          <button type="button" className={textBtn} onClick={() => { clearLock(); setConfig(null) }}>
            Poista
          </button>
        )}
        <button type="button" className={textBtn} onClick={() => setOpen(true)}>
          {config ? 'Muuta' : 'Ota käyttöön'}
        </button>
      </span>
      <Sheet open={open} onClose={close} title="Sovelluslukko">
        <LockSetup userId={userId} label={label} onDone={close} />
      </Sheet>
    </div>
  )
}
