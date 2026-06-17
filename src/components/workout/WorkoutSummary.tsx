import { ChevronLeft, Trash2, Dumbbell } from 'lucide-react'
import { Card } from '../ui'
import { fromISO } from '../../lib/dates'
import type { Workout, SetEntry } from '../../lib/workouts'

interface Props {
  workout: Workout
  onClose: () => void
  onDelete?: (id: string) => void
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m}:${String(rem).padStart(2, '0')}` : `${m}min`
}

function fmtSet(s: SetEntry): string {
  const parts: string[] = []
  if (s.reps != null) parts.push(`${s.reps}`)
  if (s.weight != null) parts.push(`${s.weight} kg`)
  if (s.duration != null) parts.push(fmtDuration(s.duration))
  return parts.join(' · ') || '–'
}

function dateLabel(iso: string): string {
  return fromISO(iso).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function WorkoutSummary({ workout, onClose, onDelete }: Props) {
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0)

  return (
    <div className="px-4 pb-10 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label="Takaisin"
          className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-full p-1.5 text-fg-muted"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[22px] font-bold tracking-[-0.02em] text-text">{workout.name}</h1>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">
            {dateLabel(workout.date)}
          </div>
        </div>
        {onDelete && (
          <button
            onClick={() => { if (window.confirm('Poistetaanko tämä treeni?')) { onDelete(workout.id); onClose() } }}
            aria-label="Poista treeni"
            className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <Card variant="panel">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Liikkeet</div>
          <div className="mt-0.5 font-display text-[24px] font-bold tabular-nums text-text">{workout.exercises.length}</div>
        </Card>
        <Card variant="panel">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Sarjat</div>
          <div className="mt-0.5 font-display text-[24px] font-bold tabular-nums text-text">{totalSets}</div>
        </Card>
      </div>

      {/* Exercises */}
      <div className="flex flex-col gap-2.5">
        {workout.exercises.map((ex) => (
          <Card key={ex.id} variant="glass">
            <div className="mb-2 flex items-center gap-2">
              <Dumbbell size={15} className="flex-shrink-0 text-cyan" />
              <div className="min-w-0 truncate font-display text-[15px] font-semibold text-text">{ex.name}</div>
            </div>
            <div className="flex flex-col gap-1">
              {ex.sets.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between border-t border-white/[0.05] py-1 text-[13px] first:border-t-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">Sarja {i + 1}</span>
                  <span className="tabular-nums text-text">{fmtSet(s)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
