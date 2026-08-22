import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { toISO, formatDateShort } from '../lib/dates'
import { countLeaves, deleteMobilityLog, listMobilityLogs, logMobility, type MobilityLog } from '../lib/mobility'
import { Tree } from '../components/mobility/Tree'

type Choice = 'upper' | 'lower' | 'both'

const CHOICES: Array<{ id: Choice; label: string; dot: string }> = [
  { id: 'upper', label: 'Yläkroppa', dot: '#7ba88a' },
  { id: 'lower', label: 'Alakroppa', dot: '#d4a857' },
  { id: 'both',  label: 'Molemmat',  dot: '#4a7c59' },
]

export function MobilityView() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<MobilityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    listMobilityLogs(user.id)
      .then((l) => { if (alive) setLogs(l) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Haku epäonnistui') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user, tick])

  const counts = useMemo(() => countLeaves(logs), [logs])

  const log = async (c: Choice) => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await logMobility(user.id, toISO(new Date()), c === 'upper' || c === 'both', c === 'lower' || c === 'both')
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1800)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kirjaus ei onnistunut')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!user) return
    setError(null)
    try {
      await deleteMobilityLog(user.id, id)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Poisto ei onnistunut')
    }
  }

  // Uusin ensin listassa, vanhin ensin puussa.
  const recent = useMemo(() => [...logs].reverse().slice(0, 12), [logs])

  return (
    <div className="flex min-h-dvh flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-7">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">LiikkuvuusPuu</div>
        <h2 className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.015em] text-text">
          {counts.total === 0 ? 'Puu odottaa ensimmäistä oksaa' : `${logs.length} oksaa, ${counts.total} lehteä`}
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Jokainen liikkuvuushetki kasvattaa puuta. Ei tavoitteita, ei sarjoja — pelkkä merkki siitä että teit sen.
        </p>
      </div>

      <div className="card-enter rounded-panel border border-white/10 bg-[rgba(9,11,20,0.5)] p-4 [backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)]">
        {loading ? (
          <p className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-fg-ghost">Ladataan…</p>
        ) : (
          <Tree logs={logs} />
        )}
        <div className="mt-2 flex justify-center gap-5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-ghost">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: '#7ba88a' }} />
            Ylä {counts.upper}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: '#d4a857' }} />
            Ala {counts.lower}
          </span>
        </div>
      </div>

      {error && (
        <p role="status" className="card-enter flex items-center gap-2 rounded-row border border-danger/40 bg-danger/[0.08] px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}

      {flash && (
        <p role="status" className="card-enter flex items-center justify-center gap-2 rounded-row border border-border-hi bg-accent/[0.10] px-4 py-3 text-[13px] text-accent">
          <Check size={14} />
          Kirjattu — puu kasvoi
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy || !user}
            onClick={() => void log(c.id)}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-3.5 text-left text-[13px] text-text transition-colors disabled:cursor-not-allowed disabled:opacity-50 [backdrop-filter:blur(14px)]"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: c.dot, boxShadow: `0 0 10px ${c.dot}80` }} />
            {c.label}
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">Viimeisimmät</div>
          <ul className="list-stagger flex flex-col gap-1.5">
            {recent.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-row border border-white/[0.07] bg-[rgba(9,11,20,0.35)] px-4 py-2.5 text-[13px]"
              >
                <span className="text-fg-muted">
                  {formatDateShort(l.logDate)}
                  <span className="ml-2 text-fg-ghost">
                    {l.upperBody && l.lowerBody ? 'ylä + ala' : l.upperBody ? 'ylä' : 'ala'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(l.id)}
                  className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.06em] text-fg-ghost"
                >
                  Poista
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
