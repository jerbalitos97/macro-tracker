import { PartyPopper, Dumbbell, Trash2 } from 'lucide-react'
import type { SpecialEvent, ExtraWorkout } from '../types'
import { formatDateShort } from '../lib/dates'
import { s } from '../styles/tokens'

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
    <div style={{ marginTop: 20 }}>
      <div style={s.sectionLabel}>Tulossa ({upcoming.length})</div>
      {upcoming.map((u) => (
        <div key={`${u.type}-${u.id}`} style={s.mealRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {u.type === 'event' ? (
              <PartyPopper size={12} color="#e87a6a" />
            ) : (
              <Dumbbell size={12} color="#6a9ad4" />
            )}
            <div>
              <div style={{ fontSize: 13 }}>
                {u.type === 'event' ? u.name : `Treeni (${u.kcal} kcal)`}
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>
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
            style={s.iconBtn}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
