import { useEffect, useState } from 'react'
import { Plus, Flame, Timer, X, Check } from 'lucide-react'
import { Sheet, Button, Chip } from '../ui'
import { WarmupFab } from './WarmupSheet'
import {
  REST_TARGETS, getActiveRest, startRest, endRest, clearActiveRest,
  elapsedSec, formatRest,
} from '../../lib/restTimer'
import type { ActiveRest, RestEntry } from '../../lib/restTimer'

// The floating button used to open the warm-up directly. It is now a "+" that
// offers the two things worth reaching for mid-session: the warm-up routine
// and a rest timer.

interface Props {
  /** Session the rest belongs to, when one is running. */
  workoutId?: string
}

export function WorkoutTools({ workoutId }: Props) {
  const [menu, setMenu] = useState(false)
  const [warmup, setWarmup] = useState(false)
  const [rest, setRest] = useState(false)
  const [active, setActive] = useState<ActiveRest | null>(() => getActiveRest())
  const [, tick] = useState(0)

  // The timer stores when it started, not how long is left, so re-reading the
  // clock is all that is needed after the app was closed or backgrounded.
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setActive(getActiveRest())
        tick((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])

  const running = active !== null
  const seconds = active ? elapsedSec(active) : 0
  const past = active ? seconds >= active.targetSec : false

  const begin = (targetSec: number) => {
    setActive(startRest(targetSec, workoutId))
    setMenu(false)
    setRest(true)
  }

  const finish = (): RestEntry | null => {
    const entry = endRest()
    setActive(null)
    setRest(false)
    return entry
  }

  return (
    <>
      {/* The button doubles as the running-rest indicator, so a rest started
          and then left behind is visible from anywhere in the tool. */}
      <button
        onClick={() => (running ? setRest(true) : setMenu(true))}
        aria-label={running ? `Lepo käynnissä ${formatRest(seconds)}` : 'Lisää'}
        className={`active:scale-95 fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex items-center justify-center gap-1.5 rounded-full border transition-transform [backdrop-filter:blur(14px)] [box-shadow:0_8px_24px_rgba(0,0,0,0.45)] ${
          running
            ? `h-12 px-4 ${past ? 'border-accent/50 bg-accent/[0.16] text-accent' : 'border-white/12 bg-[rgba(9,11,20,0.62)] text-text'}`
            : 'h-12 w-12 border-white/10 bg-[rgba(9,11,20,0.54)] text-accent'
        }`}
      >
        {running ? (
          <>
            <Timer size={16} />
            <span className="font-mono text-[14px] tabular-nums">{formatRest(seconds)}</span>
          </>
        ) : (
          <Plus size={22} />
        )}
      </button>

      {/* Chooser */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={<><Plus size={14} />Työkalut</>}>
        <button
          onClick={() => { setMenu(false); setWarmup(true) }}
          className="mb-2 flex w-full items-center gap-3 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-3.5 text-left"
        >
          <Flame size={18} className="flex-shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text">Lämmittely</div>
            <div className="text-[11px] text-fg-faint">Katso ja muokkaa lämmittelyrutiini</div>
          </div>
        </button>

        <div className="rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Timer size={18} className="flex-shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-text">Lepoajastin</div>
              <div className="text-[11px] text-fg-faint">
                Käy taustalla vaikka suljet sovelluksen — lepo päättyy kun sinä lopetat sen
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {REST_TARGETS.map((t) => (
              <Chip key={t} onClick={() => begin(t)} className="justify-center tabular-nums">
                {t < 120 ? `${t}s` : `${t / 60}min`}
              </Chip>
            ))}
          </div>
        </div>
      </Sheet>

      {/* Running rest */}
      <Sheet
        open={rest}
        onClose={() => setRest(false)}
        title={<><Timer size={14} />Lepo</>}
      >
        {active ? (
          <>
            <div className="flex flex-col items-center py-3">
              <div
                className={`font-display text-[56px] font-extrabold tabular-nums leading-none tracking-[-0.04em] ${
                  past ? 'text-accent' : 'text-text'
                }`}
              >
                {formatRest(seconds)}
              </div>
              <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
                tavoite {formatRest(active.targetSec)}
                {past && <span className="ml-2 text-accent">ylitetty</span>}
              </div>
            </div>

            <div className="mb-3 h-1 overflow-hidden rounded-sm bg-[rgba(9,11,20,0.55)]">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-accent to-[#e8d07a] transition-[width] duration-500"
                style={{ width: `${Math.min(100, (seconds / active.targetSec) * 100)}%` }}
              />
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-fg-faint">
              Ajastin ei tarvitse sovellusta pysyäkseen oikeassa: se muistaa alkuhetken ja laskee
              kuluneen ajan kellosta. Voit sulkea sovelluksen ja palata — luku on silti oikein.
              Tavoite on vain merkki matkan varrella, lepo päättyy kun painat alta.
            </p>

            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => finish()}>
                <Check size={16} /> Lopeta lepo
              </Button>
              <Button
                variant="ghost"
                onClick={() => { clearActiveRest(); setActive(null); setRest(false) }}
              >
                <X size={16} /> Hylkää
              </Button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {REST_TARGETS.map((t) => (
              <Chip key={t} onClick={() => begin(t)} className="justify-center tabular-nums">
                {t < 120 ? `${t}s` : `${t / 60}min`}
              </Chip>
            ))}
          </div>
        )}
      </Sheet>

      <WarmupFab open={warmup} onClose={() => setWarmup(false)} />
    </>
  )
}
