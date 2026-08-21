import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'

interface Props {
  /** Päivä jolle tehtävä kirjataan kun päivävalitsinta ei näytetä. */
  date: string
  showDate?: boolean
  onAdd: (title: string, dateISO: string) => Promise<void> | void
}

export function AddTaskForm({ date, showDate = false, onAdd }: Props) {
  const [title, setTitle] = useState('')
  const [pickedDate, setPickedDate] = useState(date)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setBusy(true)
    try {
      await onAdd(t, showDate ? pickedDate : date)
      setTitle('')
      setPickedDate(date)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-3 [backdrop-filter:blur(14px)]"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Uusi tehtävä…"
        aria-label="Tehtävän nimi"
        // 16px, koska iOS zoomaa sivun jokaisella pienemmällä kentällä.
        className="w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-base text-text placeholder:text-fg-ghost [color-scheme:dark]"
      />
      <div className="flex gap-2">
        {showDate && (
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            aria-label="Päivä"
            className="min-w-0 flex-1 rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-base text-text [color-scheme:dark]"
          />
        )}
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-input bg-gradient-to-br from-cyan to-blue px-4 py-3 font-mono text-[13px] font-bold tracking-[0.03em] text-bg shadow-[0_0_20px_rgba(34,211,238,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <Plus size={15} strokeWidth={2.5} />
          {busy ? 'Lisätään…' : 'Lisää'}
        </button>
      </div>
    </form>
  )
}
