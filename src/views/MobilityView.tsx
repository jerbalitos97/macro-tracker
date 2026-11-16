import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { toISO, formatDateShort } from '../lib/dates'
import { countLeaves, deleteMobilityLog, listMobilityLogs, logMobility, type MobilityLog } from '../lib/mobility'
import { Tree } from '../components/mobility/Tree'
import { Card, snack } from '../components/ui'

type Choice = 'upper' | 'lower' | 'both'

// Istunnonaikainen välimuisti — sama syy kuin TasksView'ssa: paluu työkaluun
// näyttää puun heti eikä "Ladataan…", ja taustahaku korjaa hiljaa perässä.
const logsCache = new Map<string, MobilityLog[]>()

// Kirjausnapit kuten mockupissa: ylä syaani, ala violetti, molemmat liukuväri.
// Samat värit ovat puun lehdissä ja selitteessä.
const CHOICES: Array<{ id: Choice; label: string; style: CSSProperties }> = [
  { id: 'upper', label: 'Yläkroppa', style: { background: 'rgba(34,211,238,0.18)', color: '#a5f3fc' } },
  { id: 'lower', label: 'Alakroppa', style: { background: 'rgba(167,139,250,0.22)', color: '#ddd6fe' } },
  { id: 'both',  label: 'Molemmat',  style: { background: 'linear-gradient(135deg, #22d3ee, #a78bfa)', color: '#05060c' } },
]

export function MobilityView() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<MobilityLog[]>(() => (user ? logsCache.get(user.id) ?? [] : []))
  const [loading, setLoading] = useState(() => !(user && logsCache.has(user.id)))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let alive = true
    listMobilityLogs(user.id)
      .then((l) => {
        logsCache.set(user.id, l)
        if (alive) setLogs(l)
      })
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
      snack('Kirjattu — puu kasvoi')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kirjaus ei onnistunut')
    } finally {
      setBusy(false)
    }
  }

  // Poisto heti, Kumoa kirjaa saman päivän ja kehon osat uudelleen.
  const remove = async (l: MobilityLog) => {
    if (!user) return
    setError(null)
    try {
      await deleteMobilityLog(user.id, l.id)
      reload()
      snack({
        text: 'Kirjaus poistettu',
        onAction: () => {
          logMobility(user.id, l.logDate, l.upperBody, l.lowerBody)
            .then(reload)
            .catch((e) => setError(e instanceof Error ? e.message : 'Palautus ei onnistunut'))
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Poisto ei onnistunut')
    }
  }

  // Uusin ensin listassa, vanhin ensin puussa.
  const recent = useMemo(() => [...logs].reverse().slice(0, 12), [logs])

  return (
    <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-2">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-[26px] font-medium leading-8 text-text">
          {counts.total === 0 ? 'Puu odottaa ensimmäistä oksaa' : `${logs.length} oksaa, ${counts.total} lehteä`}
        </h2>
        <p className="text-[14px] leading-5 text-fg-muted">
          Jokainen liikkuvuushetki kasvattaa puuta. Ei tavoitteita, ei sarjoja.
        </p>
      </div>

      <Card variant="panel" className="card-enter flex flex-col items-center px-2 pb-3 pt-2">
        {loading ? (
          <p className="py-16 text-center text-[14px] text-fg-muted">Ladataan…</p>
        ) : (
          <div className="w-full">
            <Tree logs={logs} />
          </div>
        )}
        <div className="mt-2 flex justify-center gap-4 text-[14px] leading-5 text-fg-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: '#22d3ee' }} />
            Ylä {counts.upper}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: '#a78bfa' }} />
            Ala {counts.lower}
          </span>
        </div>
      </Card>

      {error && (
        <p role="status" className="card-enter flex items-center gap-2 rounded-[20px] bg-[var(--surface-1)] px-4 py-3 text-[14px] leading-5 text-[#FFB4AB]">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy || !user}
            onClick={() => void log(c.id)}
            className="flex min-h-16 cursor-pointer items-center justify-center rounded-[20px] px-2 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={c.style}
          >
            {c.label}
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <h3 className="px-1 pt-2 text-[16px] font-medium leading-6 text-text">Viimeisimmät</h3>
          <ul className="list-stagger flex flex-col gap-[2px] overflow-hidden rounded-[20px]">
            {recent.map((l) => (
              <li
                key={l.id}
                className="flex min-h-14 items-center gap-3 bg-[var(--surface-1)] py-2 pl-4 pr-1"
              >
                <span className="flex-1 text-[15px] leading-6 text-text">
                  {formatDateShort(l.logDate)} · {l.upperBody && l.lowerBody ? 'ylä + ala' : l.upperBody ? 'ylä' : 'ala'}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(l)}
                  className="min-h-11 cursor-pointer rounded-full px-3 text-[14px] font-semibold text-[#FFB4AB]"
                >
                  Poista
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
