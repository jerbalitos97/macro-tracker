import { useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Settings } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { Card, Button } from '../components/ui'

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
