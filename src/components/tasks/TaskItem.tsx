import { useState } from 'react'
import { Check, Calendar, Trash2 } from 'lucide-react'
import type { Task } from '../../lib/tasks'

interface Props {
  task: Task
  onToggle: (id: string, done: boolean) => Promise<void> | void
  onReschedule: (id: string, dateISO: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}

export function TaskItem({ task, onToggle, onReschedule, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate, setNewDate] = useState(task.scheduledDate)

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-row border p-4 [backdrop-filter:blur(14px)_saturate(150%)] [-webkit-backdrop-filter:blur(14px)_saturate(150%)] ${
        task.done ? 'border-white/[0.06] bg-[rgba(9,11,20,0.30)]' : 'border-white/10 bg-[rgba(9,11,20,0.45)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => run(() => onToggle(task.id, !task.done))}
          disabled={busy}
          aria-pressed={task.done}
          aria-label={task.done ? `Merkitse tekemättömäksi: ${task.title}` : `Merkitse tehdyksi: ${task.title}`}
          className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
            task.done
              ? 'border-border-hi bg-accent/[0.18] text-accent'
              : 'border-white/15 bg-black/30 text-transparent'
          }`}
        >
          {task.done ? <Check size={15} strokeWidth={2.5} className="check-pop" /> : <Check size={15} strokeWidth={2.5} />}
        </button>
        <span
          className={`min-w-0 flex-1 break-words text-[15px] leading-snug ${
            task.done ? 'text-fg-ghost line-through' : 'text-text'
          }`}
        >
          {task.title}
        </span>
      </div>

      {!task.done && (
        <div className="flex flex-wrap items-center gap-2 pl-10">
          {rescheduling ? (
            <>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label="Uusi päivä"
                className="rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-1.5 text-[13px] text-text [color-scheme:dark]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await onReschedule(task.id, newDate)
                    setRescheduling(false)
                  })
                }
                className="cursor-pointer rounded-input border border-border-hi bg-accent/[0.12] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent disabled:opacity-50"
              >
                Tallenna
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewDate(task.scheduledDate)
                  setRescheduling(false)
                }}
                className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.06em] text-fg-ghost"
              >
                Peruuta
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRescheduling(true)}
                className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-ghost"
              >
                <Calendar size={12} />
                Siirrä
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => onDelete(task.id))}
                className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-ghost disabled:opacity-50"
              >
                <Trash2 size={12} />
                Poista
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}
