import { useEffect, useRef, useState } from 'react'
import { Play, Check, Trash2, X, ArrowUp, ArrowDown, Pause, Info, Plus } from 'lucide-react'
import { Sheet, Button } from '../ui'
import type { LoggedExercise, IntervalConfig } from '../../lib/workouts'
import { beep, primeAudio } from '../../lib/audio'
import {
  runFor, startRun, pauseRun, resumeRun, clearRun, stateOf, contractionSeconds,
} from '../../lib/intervalClock'
import type { IntervalRun, Phase } from '../../lib/intervalClock'

interface Props {
  exercise: LoggedExercise & { interval: IntervalConfig }
  onChange: (updated: LoggedExercise) => void
  onRemoveExercise: () => void
  /** Reorder without dragging (WCAG 2.5.7). Null at the ends of the list. */
  onMoveUp: (() => void) | null
  onMoveDown: (() => void) | null
  /** Show what the template prescribed for this movement. */
  onShowInfo?: () => void
  /** Recorded on the run so a clock left going is attributable to its session. */
  workoutId?: string
  onClose: () => void
}

/** The between-sides checkpoint is UI state, not clock state: it waits for a
 *  tap rather than counting, so it never belongs in a derived phase. */
type Shown = Phase | 'switch'

/** Tell the user the set finished when they are not looking at the screen.
 *
 *  Best-effort by construction: a web app gets no guaranteed wake-up, so this
 *  only fires while the page is still alive in the background. When the phone
 *  suspended it entirely the notification is missed — but the clock is derived
 *  from time, so returning to the app still shows the set correctly finished.
 *  Nothing is lost except the nudge. */
function notifyDone(title: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return // the screen already says so
    new Notification(title, { tag: 'friday-interval', silent: false })
  } catch {
    // a failed notification is never worth breaking a set over
  }
}

function speak(text: string): void {
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fi-FI'
    u.rate = 1.1
    speechSynthesis.speak(u)
  } catch { /* no speech available */ }
}

export function IntervalTimerSheet({ exercise, onChange, onRemoveExercise, onMoveUp, onMoveDown, onShowInfo, workoutId, onClose }: Props) {
  const iv = exercise.interval
  // The run lives in localStorage and is derived from the wall clock, so the
  // sheet is a window onto it rather than its owner. Closing this sheet, or the
  // app, leaves the set running.
  const [run, setRunState] = useState<IntervalRun | null>(() => runFor(exercise.id))
  const [switching, setSwitching] = useState(false)
  const [, tick] = useState(0)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  const setRun = (r: IntervalRun | null) => {
    if (r) saveAndSet(r)
    else { clearRun(); setRunState(null) }
  }
  const saveAndSet = (r: IntervalRun) => setRunState(r)

  const paused = run?.pausedAt != null
  const state = run ? stateOf(run) : null

  // Keep the screen awake while clocking.
  useEffect(() => {
    if (run && !wakeLock.current && 'wakeLock' in navigator) {
      ;(navigator as Navigator & { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock.request('screen')
        .then((l) => { wakeLock.current = l })
        .catch(() => {})
    }
    if (!run && wakeLock.current) {
      void wakeLock.current.release().catch(() => {})
      wakeLock.current = null
    }
    return () => {
      if (wakeLock.current) { void wakeLock.current.release().catch(() => {}); wakeLock.current = null }
    }
  }, [run])

  // Re-read the clock once a second, and again whenever the app comes back to
  // the foreground — that second read is what makes a backgrounded set correct
  // rather than frozen.
  useEffect(() => {
    if (!run || paused) return
    const id = window.setInterval(() => tick((n) => n + 1), 250)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setRunState(runFor(exercise.id))
        tick((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run, paused, exercise.id])

  const completeSet = (setIndex: number) => {
    onChange({
      ...exercise,
      sets: exercise.sets.map((s, i) =>
        (i === setIndex ? { ...s, duration: contractionSeconds(iv), done: true } : s)),
    })
    beep(1320); setTimeout(() => beep(1320), 200); setTimeout(() => beep(1760), 400)
    speak('Sarja valmis')
    notifyDone(`${exercise.name}: sarja valmis`)
    setSwitching(false)
    setRun(null)
  }

  /** Interval sets are markers, not numbers, so adding one is just another
   *  round to clock and removing one drops a round that did not happen. */
  const addSet = () => onChange({ ...exercise, sets: [...exercise.sets, {}] })

  /** Mark a set done — or undone — without the clock. Marking it by hand
   *  records no duration, because none was measured; inventing one would put a
   *  number in the log that nothing observed. */
  const toggleDone = (i: number) =>
    onChange({
      ...exercise,
      sets: exercise.sets.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s)),
    })

  const removeSet = (i: number) => {
    if (exercise.sets.length <= 1) return
    if (run) { setSwitching(false); setRun(null) }
    onChange({ ...exercise, sets: exercise.sets.filter((_, idx) => idx !== i) })
  }

  const startClock = (setIndex: number, side: 1 | 2 = 1) => {
    primeAudio() // this tap is the gesture that lets later beeps be heard
    beep(880)
    speak('Valmistaudu')
    setSwitching(false)
    setRunState(startRun(exercise.id, setIndex, iv, side, workoutId))
  }

  // Announce phase changes. The clock does not emit events — it is a function
  // of time — so a transition is "the phase we are showing differs from the one
  // we last spoke". That also means a phase whose whole span passed while the
  // app was closed is simply never announced, which is correct: it is over.
  const spoken = useRef<string | null>(null)
  useEffect(() => {
    if (!run || !state || paused) return
    const key = `${run.startedAt}:${run.side}:${state.phase}:${state.round}`
    if (spoken.current === key) return
    const first = spoken.current === null
    spoken.current = key
    if (first) return // opening onto a run in progress should not re-announce it
    if (state.phase === 'work') { beep(1320); speak('Contraction') }
    else if (state.phase === 'rest') { beep(660); speak('Lepo') }
  }, [run, state?.phase, state?.round, paused])

  // Completion is also derived: when the clock says this side is done, either
  // hand over to side 2 or finish the set.
  useEffect(() => {
    if (!run || !state || paused || state.phase !== 'done') return
    if (iv.perSide && run.side === 1) {
      if (!switching) {
        beep(660); setTimeout(() => beep(660), 200)
        speak('Vaihda jalka')
        notifyDone(`${exercise.name}: vaihda jalka`)
        setSwitching(true)
      }
      return
    }
    completeSet(run.setIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, state?.phase, paused, switching])

  const configLabel = `${iv.workSeconds}s contraction / ${iv.restSeconds}s lepo × ${iv.rounds}${iv.perSide ? ' · per puoli' : ''}`

  const phaseLabel: Record<Shown, string> = {
    countdown: 'Valmistaudu',
    work: 'Contraction',
    rest: 'Lepo',
    done: 'Valmis',
    switch: 'Vaihda jalka',
  }

  const phaseColor: Record<Shown, string> = {
    countdown: 'text-fg-muted',
    work: 'text-cyan',
    rest: 'text-violet',
    done: 'text-cyan',
    switch: 'text-accent',
  }

  const shown: Shown = switching ? 'switch' : (state?.phase ?? 'countdown')

  return (
    <Sheet open onClose={onClose} title={<span className="normal-case">{exercise.name}</span>}>
      {onShowInfo && (
        <button
          onClick={onShowInfo}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-row border border-white/[0.10] py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted"
        >
          <Info size={13} /> Pohjan ohje
        </button>
      )}

      <div className="mb-3 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-3 py-2 font-mono text-[11px] text-fg-muted">
        {configLabel}
      </div>

      {run && state ? (
        <div className="flex flex-col items-center py-4">
          <div
            className={`font-mono text-[13px] uppercase tracking-[0.2em] ${paused ? 'text-accent' : phaseColor[shown]}`}
            aria-live="polite"
          >
            {paused ? `${phaseLabel[shown]} · tauolla` : phaseLabel[shown]}
          </div>

          {shown !== 'switch' ? (
            <div
              className={`my-2 font-display text-[96px] font-bold leading-none tabular-nums transition-opacity ${phaseColor[shown]} ${paused ? 'opacity-40' : ''}`}
            >
              {state.secondsLeft}
            </div>
          ) : (
            <button
              onClick={() => startClock(run.setIndex, 2)}
              className="my-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-violet font-display text-[15px] font-bold text-bg"
            >
              Jalka 2
            </button>
          )}

          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
            Sarja {run.setIndex + 1}/{exercise.sets.length}
            {' · '}Kierros {state.round}/{iv.rounds}
            {iv.perSide && <>{' · '}Puoli {run.side}/2</>}
          </div>

          {/* The clock is derived from the wall clock, so saying so is not a
              reassurance — it is the reason closing this is safe. */}
          <p className="mt-2 max-w-[260px] text-center text-[10px] leading-snug text-fg-ghost">
            Voit sulkea tämän tai koko sovelluksen — kello jatkaa ja ilmoittaa kun sarja on valmis.
          </p>

          <div className="mt-4 flex items-center gap-2">
            {shown !== 'switch' && (
              <button
                onClick={() => setRunState(paused ? resumeRun(run) : pauseRun(run))}
                className="flex items-center gap-1.5 rounded-input border border-white/10 bg-[rgba(9,11,20,0.48)] px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.06em] text-text"
              >
                {paused ? <><Play size={14} /> Jatka</> : <><Pause size={14} /> Tauko</>}
              </button>
            )}
            <button
              onClick={() => { setSwitching(false); setRun(null) }}
              className="flex items-center gap-1.5 rounded-input border border-white/10 bg-[rgba(9,11,20,0.48)] px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.06em] text-fg-muted"
            >
              <X size={14} /> Keskeytä
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {exercise.sets.map((s, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-row border px-4 py-3 ${
                  s.done ? 'border-cyan/25 bg-cyan/[0.08]' : 'border-white/10 bg-[rgba(9,11,20,0.45)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12px] tabular-nums text-fg-faint">{i + 1}</span>
                  <span className={`font-display text-[14px] font-semibold ${s.done ? 'text-cyan' : 'text-text'}`}>
                    {s.done ? 'Tehty' : 'Sarja'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Ticking a set off by hand, without clocking it. Plenty of
                      mobility work gets done away from the phone — counted in
                      the head, or on a set already in progress when the app was
                      opened — and the clock being the only way to mark it meant
                      the log said "not done" for work that was. */}
                  <button
                    onClick={() => toggleDone(i)}
                    aria-label={s.done ? `Merkitse sarja ${i + 1} tekemättömäksi` : `Merkitse sarja ${i + 1} tehdyksi`}
                    aria-pressed={s.done === true}
                    className={`flex h-9 w-9 !min-h-0 !min-w-0 items-center justify-center rounded-full transition-colors ${
                      s.done ? 'bg-cyan text-bg' : 'border border-white/20 text-fg-faint'
                    }`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </button>
                  <button
                    onClick={() => startClock(i)}
                    aria-label={`Kellota sarja ${i + 1}`}
                    className="flex h-9 w-9 !min-h-0 !min-w-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-violet text-bg"
                  >
                    <Play size={15} />
                  </button>
                  <button
                    onClick={() => removeSet(i)}
                    disabled={exercise.sets.length <= 1}
                    aria-label={`Poista sarja ${i + 1}`}
                    className="icon-btn flex h-[30px] w-[30px] !min-h-0 !min-w-0 items-center justify-center rounded-md text-fg-faint hover:text-danger disabled:opacity-30"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Same as a strength exercise: the plan says how many rounds, the
              day says how many you actually did. */}
          <button
            onClick={addSet}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.14] bg-transparent py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted"
          >
            <Plus size={14} /> Lisää sarja
          </button>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => onMoveUp?.()}
              disabled={!onMoveUp}
              aria-label="Siirrä liike ylöspäin"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-white/10 bg-[rgba(9,11,20,0.48)] text-fg-muted disabled:opacity-25"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => onMoveDown?.()}
              disabled={!onMoveDown}
              aria-label="Siirrä liike alaspäin"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-white/10 bg-[rgba(9,11,20,0.48)] text-fg-muted disabled:opacity-25"
            >
              <ArrowDown size={16} />
            </button>
            <button
              onClick={() => { onRemoveExercise(); onClose() }}
              aria-label="Poista liike"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-danger/30 bg-danger/[0.08] text-danger"
            >
              <Trash2 size={16} />
            </button>
            <Button variant="primary" onClick={onClose}>
              <Check size={16} /> Valmis
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
