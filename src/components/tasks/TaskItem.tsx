import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import type { Task } from '../../lib/tasks'
import { celebrate } from '../../lib/flash'
import { addDays, getWeekdayNum, toISO } from '../../lib/dates'

interface Props {
  task: Task
  /** Aiemmalta päivältä siirtynyt tehtävä: päivä jolle se oli tarkoitettu.
   *  Näkyvissä jotta rästin ikä on luettavissa ilman kuukausinäkymää. */
  carriedFrom?: string
  onToggle: (id: string, done: boolean) => Promise<unknown> | void
  onReschedule: (task: Task, dateISO: string) => Promise<unknown> | void
  onDelete: (task: Task) => Promise<unknown> | void
}

/** "eiliseltä" tai "3 päivää sitten" — ikä sanoina, koska pelkkä päivämäärä
 *  vaatii laskemista ja tämä lista on tehty luettavaksi vilkaisulla. */
function carriedLabel(fromISO_: string): string {
  const d = new Date(fromISO_ + 'T12:00:00')
  const now = new Date()
  const days = Math.round((new Date(now.toISOString().slice(0, 10) + 'T12:00:00').getTime() - d.getTime()) / 86400000)
  if (days <= 1) return 'eiliseltä'
  if (days < 7) return `${days} päivää sitten`
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + ' alkaen'
}

/** Seuraava maanantai tästä päivästä; maanantaina viikon päästä. */
function nextMonday(todayISO: string): string {
  const dow = getWeekdayNum(todayISO) // 0 = su
  return addDays(todayISO, ((8 - dow) % 7) || 7)
}

const CHIP =
  'inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-white/[0.18] bg-transparent px-3.5 text-[14px] font-medium text-text disabled:opacity-50'

export function TaskItem({ task, carriedFrom, onToggle, onReschedule, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [moving, setMoving] = useState(false)

  const today = toISO(new Date())
  const tomorrow = addDays(today, 1)
  const monday = nextMonday(today)

  const run = async (fn: () => Promise<unknown> | void) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const moveTo = (iso: string) =>
    run(async () => {
      await onReschedule(task, iso)
      setMoving(false)
    })

  return (
    <li
      data-flash
      style={{ '--flash': '#22d3ee' } as CSSProperties}
      className="relative flex flex-col gap-2 bg-[var(--surface-1)] py-2 pl-3 pr-1"
    >
      <div className="flex min-h-14 items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            // Kuittaus välähtää heti, ei tallennuksen jälkeen. Vahvistus
            // kuuluu painallukseen; tallennus on jonossa oleva asia, jonka
            // epäonnistuminen näkyy tilan palautumisena.
            if (!task.done) celebrate(e.currentTarget)
            void run(() => onToggle(task.id, !task.done))
          }}
          disabled={busy}
          aria-pressed={task.done}
          aria-label={task.done ? `Merkitse tekemättömäksi: ${task.title}` : `Merkitse tehdyksi: ${task.title}`}
          className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
            task.done
              ? 'border-2 border-transparent bg-gradient-to-br from-cyan to-violet text-bg'
              : 'border-2 border-white/30 bg-transparent text-transparent'
          }`}
        >
          <Check size={18} strokeWidth={3} className={task.done ? 'check-pop' : undefined} />
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`block break-words text-[16px] leading-6 ${
              task.done ? 'text-fg-muted line-through' : 'text-text'
            }`}
          >
            {task.title}
          </span>
          {carriedFrom && !task.done && (
            <span className="text-[12px] leading-4 text-[#F2D29B]">{carriedLabel(carriedFrom)}</span>
          )}
        </span>
        {!task.done && (
          <button
            type="button"
            onClick={() => setMoving((m) => !m)}
            aria-expanded={moving}
            className="min-h-10 shrink-0 cursor-pointer rounded-full bg-transparent px-3 text-[14px] font-semibold text-cyan"
          >
            Siirrä
          </button>
        )}
      </div>

      {moving && !task.done && (
        <div className="flex flex-wrap gap-1.5 pb-1 pl-14">
          {task.scheduledDate !== today && (
            <button type="button" disabled={busy} onClick={() => moveTo(today)} className={CHIP}>Tänään</button>
          )}
          {task.scheduledDate !== tomorrow && (
            <button type="button" disabled={busy} onClick={() => moveTo(tomorrow)} className={CHIP}>Huomenna</button>
          )}
          {task.scheduledDate !== monday && (
            <button type="button" disabled={busy} onClick={() => moveTo(monday)} className={CHIP}>Ensi ma</button>
          )}
          {/* Muu päivä: natiivi päivävalitsin chipin näköisenä, jotta
              mielivaltainen siirto säilyy pikavalintojen rinnalla. */}
          <label className={`${CHIP} relative`}>
            Muu päivä
            <input
              type="date"
              aria-label="Siirrä päivälle"
              onChange={(e) => { if (e.target.value) void moveTo(e.target.value) }}
              className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => onDelete(task))}
            className={`${CHIP} text-[#FFB4AB]`}
          >
            Poista
          </button>
        </div>
      )}
    </li>
  )
}
