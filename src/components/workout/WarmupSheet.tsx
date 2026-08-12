import { useEffect, useState } from 'react'
import { Flame, Pencil, Plus, Trash2, Check, GripVertical } from 'lucide-react'
import { Sheet, Button, DragItem, useDragReorder, moveById, moveByDelta } from '../ui'
import { useAuth } from '../../contexts/AuthContext'
import { uid } from '../../lib/workouts'
import { getWarmup, saveWarmupLocal, pullWarmup, syncWarmupCloud } from '../../lib/warmup'
import type { WarmupMove } from '../../lib/warmup'

const label = 'mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const input =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-2 text-sm text-text [color-scheme:dark]'

/** Floating warm-up button + routine sheet, shown on every workout screen.
 *  The routine is editable: moves can be added, changed and removed. */
export function WarmupFab() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [moves, setMoves] = useState<WarmupMove[]>(() => getWarmup())
  const [draft, setDraft] = useState<WarmupMove[]>([])

  // Refresh from the cloud when logged in.
  useEffect(() => {
    if (!user) return
    let alive = true
    pullWarmup(user.id).then((ms) => { if (alive) setMoves(ms) })
    return () => { alive = false }
  }, [user])

  const startEdit = () => {
    setDraft(moves.map((m) => ({ ...m })))
    setEditing(true)
  }

  const patch = (id: string, p: Partial<WarmupMove>) =>
    setDraft((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)))

  // These rows are full of text inputs, so a hold on the row itself has to keep
  // placing the caret — the drag lives on the grip alone. Alt+Arrow is the
  // keyboard equivalent.
  const reorder = useDragReorder((fromId, toId) => setDraft((prev) => moveById(prev, fromId, toId)))
  const move = (id: string, delta: -1 | 1) => setDraft((prev) => moveByDelta(prev, id, delta))

  const saveEdit = () => {
    const cleaned = draft
      .filter((m) => m.name.trim().length > 0)
      .map((m) => ({
        ...m,
        name: m.name.trim(),
        dose: m.dose.trim(),
        detail: m.detail?.trim() || undefined,
      }))
    setMoves(cleaned)
    saveWarmupLocal(cleaned)
    if (user) syncWarmupCloud(user.id, cleaned)
    setEditing(false)
  }

  const close = () => { setOpen(false); setEditing(false) }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Lämmittely"
        className="active:scale-95 fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[rgba(9,11,20,0.54)] text-accent transition-transform [backdrop-filter:blur(14px)] [box-shadow:0_8px_24px_rgba(0,0,0,0.45)]"
      >
        <Flame size={20} />
      </button>

      <Sheet
        open={open}
        onClose={close}
        title={
          <>
            <Flame size={14} /> Lämppä · {editing ? 'muokkaa rutiinia' : `${moves.length} liikettä, ei skipata`}
            {!editing && (
              <button
                onClick={startEdit}
                aria-label="Muokkaa rutiinia"
                className="ml-auto flex h-8 w-8 !min-h-0 !min-w-0 items-center justify-center rounded-full border border-white/15 bg-[rgba(9,11,20,0.50)] text-fg-muted"
              >
                <Pencil size={13} />
              </button>
            )}
          </>
        }
      >
        {!editing ? (
          <>
            <p className="mb-4 text-[12px] leading-relaxed text-fg-muted">
              Kiireessä pudotusjärjestys: 4 pois ensin — 2 ja 5 ei ikinä.
            </p>
            <ol className="flex flex-col gap-2.5">
              {moves.map((mv, i) => (
                <li key={mv.id} className="rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-fg-faint">{i + 1}</span>
                    <span className="font-display text-[14px] font-semibold text-text">{mv.name}</span>
                  </div>
                  {mv.detail && (
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{mv.detail}</p>
                  )}
                  <div className="mt-1.5 font-mono text-[11px] text-accent">{mv.dose}</div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11px] leading-relaxed text-fg-faint">
              Korvaa erillisen aktivoinnin — ramppisarja on spesifein mahdollinen lämmittely.
            </p>
            <button
              onClick={startEdit}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.16] bg-transparent py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted"
            >
              <Pencil size={13} /> Muokkaa rutiinia
            </button>
          </>
        ) : (
          <>
            <div ref={reorder.containerRef} className="flex flex-col gap-2.5">
              {draft.map((mv, i) => (
                <DragItem
                  key={mv.id}
                  id={mv.id}
                  reorder={reorder}
                  onMove={(d) => move(mv.id, d)}
                  tabIndex={0}
                  ariaLabel={`Liike ${i + 1}: ${mv.name || 'nimetön'}`}
                  className="rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] px-3.5 py-3"
                >
                  {({ handleProps }) => (
                    <>
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          {...handleProps}
                          className="-m-1.5 flex flex-shrink-0 cursor-grab touch-none items-center gap-1 p-1.5 active:cursor-grabbing"
                        >
                          <GripVertical size={15} className="text-fg-faint" />
                          <span className="font-mono text-[10px] text-fg-faint">{i + 1}</span>
                        </div>
                        <input
                          value={mv.name}
                          onChange={(e) => patch(mv.id, { name: e.target.value })}
                          placeholder="Liikkeen nimi"
                          className={`${input} min-w-0 flex-1`}
                        />
                        <button
                          onClick={() => setDraft((prev) => prev.filter((x) => x.id !== mv.id))}
                          aria-label="Poista liike"
                          className="icon-btn flex !min-h-0 !min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mb-2">
                        <label className={label}>Kuvaus (valinnainen)</label>
                        <input
                          value={mv.detail ?? ''}
                          onChange={(e) => patch(mv.id, { detail: e.target.value })}
                          placeholder="esim. quadruped rocks + rystypito"
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={label}>Annostus</label>
                        <input
                          value={mv.dose}
                          onChange={(e) => patch(mv.id, { dose: e.target.value })}
                          placeholder="esim. 2×10 tai 60–90s"
                          className={input}
                        />
                      </div>
                    </>
                  )}
                </DragItem>
              ))}
            </div>

            <button
              onClick={() => setDraft((prev) => [...prev, { id: uid(), name: '', dose: '' }])}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.14] bg-transparent py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted"
            >
              <Plus size={14} /> Lisää liike
            </button>

            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Peru</Button>
              <Button variant="primary" onClick={saveEdit} disabled={!draft.some((m) => m.name.trim())}>
                <Check size={16} /> Tallenna
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
