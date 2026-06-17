import { PartyPopper, Dumbbell, Trash2 } from 'lucide-react'
import type { SpecialEvent, ExtraWorkout } from '../types'
import { formatDateShort } from '../lib/dates'

const sectionLabel = 'mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

interface Props {
  events: SpecialEvent[]
  extras: ExtraWorkout[]
  todayISO: string
  onDeleteEvent: (id: number) => void
  onDeleteExtra: (id: number) => void
}

export function UpcomingList({ events, extras, todayISO, onDeleteEvent, onDeleteExtra }: Props) {
  type Item =
    | (SpecialEvent & { type: 'event' })
    | (ExtraWorkout & { type: 'extra' })

  const upcoming: Item[] = [
    ...events.filter((e) => e.date >= todayISO).map((e) => ({ ...e, type: 'event' as const })),
    ...extras.filter((e) => e.date >= todayISO).map((e) => ({ ...e, type: 'extra' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  if (upcoming.length === 0) return null

  return (
    <div className="mt-5">
      <div className={sectionLabel}>Tulossa ({upcoming.length})</div>
      {upcoming.map((u) => (
        <div
          key={`${u.type}-${u.id}`}
          className="flex items-center justify-between border-b border-white/[0.05] py-[11px]"
        >
          <div className="flex min-w-0 items-center gap-2">
            {u.type === 'event' ? (
              <PartyPopper size={12} className="flex-shrink-0 text-danger" />
            ) : (
              <Dumbbell size={12} className="flex-shrink-0 text-protein" />
            )}
            <div className="min-w-0">
              <div className="truncate text-[13px] text-text">
                {u.type === 'event' ? u.name : `Treeni (${u.kcal} kcal)`}
              </div>
              <div className="truncate text-[10px] text-muted">
                {formatDateShort(u.date)}
                {u.type === 'event' &&
                  ` · +${u.excessKcal} kcal · buffer ${u.bufferDays} pv`}
              </div>
            </div>
          </div>
          <button
            onClick={() =>
              u.type === 'event' ? onDeleteEvent(u.id) : onDeleteExtra(u.id)
            }
            className="icon-btn flex items-center justify-center rounded-md p-1.5 text-muted"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
