import { useState, type FormEvent } from 'react'

interface Props {
  /** Päivä jolle tehtävä kirjataan. Kuukausinäkymässä se on kalenterista
   *  valittu päivä, joten erillistä päivävalitsinta ei tarvita. */
  date: string
  placeholder?: string
  onAdd: (title: string, dateISO: string) => Promise<unknown> | void
}

export function AddTaskForm({ date, placeholder = 'Uusi tehtävä…', onAdd }: Props) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setBusy(true)
    try {
      await onAdd(t, date)
      setTitle('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="Uusi tehtävä"
        // 16px, koska iOS zoomaa sivun jokaisella pienemmällä kentällä.
        className="h-12 min-w-0 flex-1 rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-3.5 text-base text-text placeholder:text-fg-muted [color-scheme:dark]"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="min-h-12 shrink-0 cursor-pointer rounded-full bg-gradient-to-br from-cyan to-blue px-5 text-[14px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Lisätään…' : 'Lisää'}
      </button>
    </form>
  )
}
