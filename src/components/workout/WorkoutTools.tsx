import { useEffect, useState } from 'react'
import { Plus, Timer, X, Check, SlidersHorizontal, Infinity as InfinityIcon } from 'lucide-react'
import { Sheet, Button, Chip } from '../ui'
import {
  REST_TARGETS, getActiveRest, startRest, startHold, endRest, clearActiveRest,
  elapsedSec, formatRest, isHold,
} from '../../lib/restTimer'
import type { ActiveRest, RestEntry } from '../../lib/restTimer'

// The floating button used to open the warm-up directly. It is now a "+" that
// offers the two things worth reaching for mid-session: the warm-up routine
// and a rest timer.

interface Props {
  /** Session the rest belongs to, when one is running. */
  workoutId?: string
  /** Re-open the day assessment mid-session. Lives here rather than on the
   *  logger itself so the session screen stays a list of movements. */
  onEditCheck?: () => void
}

export function WorkoutTools({ workoutId, onEditCheck }: Props) {
  const [menu, setMenu] = useState(false)
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

  const beginHold = () => {
    setActive(startHold(workoutId))
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
        {/* The warm-up used to live here as a second, separately-edited routine.
            It is now the package the template names, shown at the top of the
            logger with the day's gates applied — one warm-up, not two. */}
        {onEditCheck && (
          <button
            onClick={() => { setMenu(false); onEditCheck() }}
            className="mb-2 flex w-full items-center gap-3 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-3.5 text-left"
          >
            <SlidersHorizontal size={18} className="flex-shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-text">Muokkaa päiväarviota</div>
              <div className="text-[11px] text-fg-faint">
                Jos jokin alkoi tuntua kesken treenin, portit ratkaistaan uudelleen
              </div>
            </div>
          </button>
        )}

        <div className="rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Timer size={18} className="flex-shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-text">Kello</div>
              <div className="text-[11px] text-fg-faint">
                Käy taustalla vaikka suljet sovelluksen — päättyy kun sinä lopetat sen
              </div>
            </div>
          </div>
          <ClockChoices onRest={begin} onHold={beginHold} />
        </div>
      </Sheet>

      {/* Running rest */}
      <Sheet
        open={rest}
        onClose={() => setRest(false)}
        title={<><Timer size={14} />{active && isHold(active) ? 'Pito' : 'Lepo'}</>}
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
                {isHold(active) ? 'ei tavoitetta' : `tavoite ${formatRest(active.targetSec)}`}
                {past && <span className="ml-2 text-accent">ylitetty</span>}
              </div>
            </div>

            {/* A hold has no bar: there is nothing to be a fraction of, and a
                bar filling towards some number would read as a place to stop. */}
            {!isHold(active) && (
              <div className="mb-3 h-1 overflow-hidden rounded-sm bg-[rgba(9,11,20,0.55)]">
                <div
                  className="h-full rounded-sm bg-gradient-to-r from-accent to-[#e8d07a] transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (seconds / active.targetSec) * 100)}%` }}
                />
              </div>
            )}

            <p className="mb-3 text-[11px] leading-relaxed text-fg-faint">
              {isHold(active)
                ? 'Kello ei tarvitse sovellusta pysyäkseen oikeassa: se muistaa alkuhetken ja laskee kuluneen ajan kellosta. Pidolla ei ole tavoitetta — se päättyy kun päätät sen, ja kesto kirjautuu.'
                : 'Ajastin ei tarvitse sovellusta pysyäkseen oikeassa: se muistaa alkuhetken ja laskee kuluneen ajan kellosta. Voit sulkea sovelluksen ja palata — luku on silti oikein. Tavoite on vain merkki matkan varrella, lepo päättyy kun painat alta.'}
            </p>

            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => finish()}>
                <Check size={16} /> {isHold(active) ? 'Lopeta pito' : 'Lopeta lepo'}
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
          <ClockChoices onRest={begin} onHold={beginHold} />
        )}
      </Sheet>

    </>
  )
}

/** Rest targets and the open-ended hold, offered together. Two different jobs:
 *  a rest is waiting for a number to pass, a hold is finding out what the
 *  number was. */
function ClockChoices({ onRest, onHold }: { onRest: (sec: number) => void; onHold: () => void }) {
  return (
    <>
      <div className="mb-1 mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Lepo</div>
      <div className="grid grid-cols-4 gap-1.5">
        {REST_TARGETS.map((t) => (
          <Chip key={t} onClick={() => onRest(t)} className="justify-center tabular-nums">
            {t < 120 ? `${t}s` : `${t / 60}min`}
          </Chip>
        ))}
      </div>
      <div className="mb-1 mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Pito</div>
      <Chip onClick={onHold} className="w-full justify-center">
        <InfinityIcon size={13} /> Käynnistä pitokello
      </Chip>
      <p className="m-0 mt-1.5 text-[10px] leading-snug text-fg-ghost">
        Ei aikarajaa — mittaa kuinka kauan pito kesti.
      </p>
    </>
  )
}
