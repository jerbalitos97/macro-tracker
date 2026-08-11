import { useEffect, useRef, useState } from 'react'
import { Play, Check, Trash2, X, ArrowUp, ArrowDown, Pause } from 'lucide-react'
import { Sheet, Button } from '../ui'
import type { LoggedExercise, IntervalConfig } from '../../lib/workouts'

interface Props {
  exercise: LoggedExercise & { interval: IntervalConfig }
  onChange: (updated: LoggedExercise) => void
  onRemoveExercise: () => void
  /** Reorder without dragging (WCAG 2.5.7). Null at the ends of the list. */
  onMoveUp: (() => void) | null
  onMoveDown: (() => void) | null
  onClose: () => void
}

type Phase = 'countdown' | 'work' | 'rest' | 'switch'

interface Run {
  setIndex: number
  phase: Phase
  side: 1 | 2
  round: number
  secondsLeft: number
}

// ── Audio cues ─────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null

function beep(freq: number, ms = 160): void {
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000)
    osc.start()
    osc.stop(audioCtx.currentTime + ms / 1000)
  } catch { /* no audio available */ }
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

export function IntervalTimerSheet({ exercise, onChange, onRemoveExercise, onMoveUp, onMoveDown, onClose }: Props) {
  const iv = exercise.interval
  const [run, setRun] = useState<Run | null>(null)
  const [paused, setPaused] = useState(false)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

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

  const completeSet = (setIndex: number) => {
    // Record total contraction time so the summary has something to show.
    const sides = iv.perSide ? 2 : 1
    const total = iv.workSeconds * iv.rounds * sides
    onChange({
      ...exercise,
      sets: exercise.sets.map((s, i) => (i === setIndex ? { ...s, duration: total, done: true } : s)),
    })
    beep(1320); setTimeout(() => beep(1320), 200); setTimeout(() => beep(1760), 400)
    speak('Sarja valmis')
    setPaused(false)
    setRun(null)
  }

  const startClock = (setIndex: number, side: 1 | 2 = 1) => {
    setPaused(false)
    beep(880)
    speak('Valmistaudu')
    setRun({ setIndex, phase: 'countdown', side, round: 1, secondsLeft: 3 })
  }

  // One state transition per second while a phase is running. The effect
  // re-arms on every `run` change, so the closure always sees fresh state.
  useEffect(() => {
    if (!run || run.phase === 'switch' || paused) return
    const t = setTimeout(() => {
      const r = run
      if (r.secondsLeft > 1) {
        if (r.phase === 'countdown') beep(880)
        setRun({ ...r, secondsLeft: r.secondsLeft - 1 })
        return
      }
      // Phase over → decide what comes next.
      const startWork = (round: number) => {
        beep(1320)
        speak('Contraction')
        setRun({ ...r, phase: 'work', round, secondsLeft: iv.workSeconds })
      }
      if (r.phase === 'countdown') {
        startWork(r.round)
        return
      }
      if (r.phase === 'work') {
        if (r.round < iv.rounds) {
          if (iv.restSeconds < 1) {
            startWork(r.round + 1)
            return
          }
          beep(660)
          speak('Lepo')
          setRun({ ...r, phase: 'rest', secondsLeft: iv.restSeconds })
          return
        }
        // Last round done for this side.
        if (iv.perSide && r.side === 1) {
          beep(660); setTimeout(() => beep(660), 200)
          speak('Vaihda jalka')
          setRun({ ...r, phase: 'switch', secondsLeft: 0 })
          return
        }
        completeSet(r.setIndex)
        return
      }
      // rest → next round
      startWork(r.round + 1)
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, paused])

  const configLabel = `${iv.workSeconds}s contraction / ${iv.restSeconds}s lepo × ${iv.rounds}${iv.perSide ? ' · per puoli' : ''}`

  const phaseLabel: Record<Phase, string> = {
    countdown: 'Valmistaudu',
    work: 'Contraction',
    rest: 'Lepo',
    switch: 'Vaihda jalka',
  }

  const phaseColor: Record<Phase, string> = {
    countdown: 'text-fg-muted',
    work: 'text-cyan',
    rest: 'text-violet',
    switch: 'text-accent',
  }

  return (
    <Sheet open onClose={onClose} title={<span className="normal-case">{exercise.name}</span>}>
      <div className="mb-3 rounded-row border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[11px] text-fg-muted">
        {configLabel}
      </div>

      {run ? (
        <div className="flex flex-col items-center py-4">
          <div
            className={`font-mono text-[13px] uppercase tracking-[0.2em] ${paused ? 'text-accent' : phaseColor[run.phase]}`}
            aria-live="polite"
          >
            {paused ? `${phaseLabel[run.phase]} · tauolla` : phaseLabel[run.phase]}
          </div>

          {run.phase !== 'switch' ? (
            <div
              className={`my-2 font-display text-[96px] font-bold leading-none tabular-nums transition-opacity ${phaseColor[run.phase]} ${paused ? 'opacity-40' : ''}`}
            >
              {run.secondsLeft}
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
            {' · '}Kierros {run.round}/{iv.rounds}
            {iv.perSide && <>{' · '}Puoli {run.side}/2</>}
          </div>

          <div className="mt-5 flex items-center gap-2">
            {run.phase !== 'switch' && (
              <button
                onClick={() => setPaused((p) => !p)}
                className="flex items-center gap-1.5 rounded-input border border-white/10 bg-white/[0.05] px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.06em] text-text"
              >
                {paused ? <><Play size={14} /> Jatka</> : <><Pause size={14} /> Tauko</>}
              </button>
            )}
            <button
              onClick={() => { setPaused(false); setRun(null) }}
              className="flex items-center gap-1.5 rounded-input border border-white/10 bg-white/[0.05] px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.06em] text-fg-muted"
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
                  s.done ? 'border-cyan/25 bg-cyan/[0.08]' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12px] tabular-nums text-fg-faint">{i + 1}</span>
                  <span className={`font-display text-[14px] font-semibold ${s.done ? 'text-cyan' : 'text-text'}`}>
                    {s.done ? 'Tehty' : 'Sarja'}
                  </span>
                </div>
                <button
                  onClick={() => startClock(i)}
                  aria-label={`Kellota sarja ${i + 1}`}
                  className={`flex h-9 w-9 !min-h-0 !min-w-0 items-center justify-center rounded-full ${
                    s.done ? 'border border-cyan/40 text-cyan' : 'bg-gradient-to-br from-cyan to-violet text-bg'
                  }`}
                >
                  {s.done ? <Check size={15} strokeWidth={3} /> : <Play size={15} />}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => onMoveUp?.()}
              disabled={!onMoveUp}
              aria-label="Siirrä liike ylöspäin"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-white/10 bg-white/[0.05] text-fg-muted disabled:opacity-25"
            >
              <ArrowUp size={16} />
            </button>
            <button
              onClick={() => onMoveDown?.()}
              disabled={!onMoveDown}
              aria-label="Siirrä liike alaspäin"
              className="flex h-11 w-11 !min-h-0 !min-w-0 items-center justify-center rounded-input border border-white/10 bg-white/[0.05] text-fg-muted disabled:opacity-25"
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
