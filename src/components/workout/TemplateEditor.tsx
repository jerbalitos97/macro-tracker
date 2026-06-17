import { useState } from 'react'
import { ChevronLeft, Plus, Trash2, Check } from 'lucide-react'
import { Card, Button } from '../ui'
import type { WorkoutTemplate, TemplateExercise } from '../../lib/workouts'
import { uid } from '../../lib/workouts'

interface Props {
  initial?: WorkoutTemplate
  onSave: (template: WorkoutTemplate) => void
  onCancel: () => void
}

const label = 'mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const numInput =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-2 text-center text-sm tabular-nums text-text [color-scheme:dark]'

function blankExercise(): TemplateExercise {
  return { id: uid(), name: '', defaultSets: 3, repRange: { min: 8, max: 12 } }
}

function toInt(v: string): number | undefined {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function TemplateEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    initial?.exercises.length ? initial.exercises.map((e) => ({ ...e })) : [blankExercise()],
  )

  const patch = (id: string, p: Partial<TemplateExercise>) =>
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)))

  const canSave = name.trim().length > 0 && exercises.some((e) => e.name.trim().length > 0)

  const handleSave = () => {
    if (!canSave) return
    const now = new Date().toISOString()
    const cleaned = exercises
      .filter((e) => e.name.trim().length > 0)
      .map((e) => ({ ...e, name: e.name.trim(), defaultSets: Math.max(1, e.defaultSets || 1) }))
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      exercises: cleaned,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <div className="px-4 pb-28 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onCancel}
          aria-label="Takaisin"
          className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-full p-1.5 text-fg-muted"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-text">
          {initial ? 'Muokkaa pohjaa' : 'Uusi pohja'}
        </h1>
      </div>

      {/* Name */}
      <Card variant="glass" className="mb-2.5">
        <label className={label}>Pohjan nimi</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="esim. Push A"
          autoFocus
          className="w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-sm text-text [color-scheme:dark]"
        />
      </Card>

      {/* Exercises */}
      <div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim">
        Liikkeet ({exercises.length})
      </div>
      <div className="flex flex-col gap-2.5">
        {exercises.map((e, i) => (
          <Card key={e.id} variant="panel">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="font-mono text-[10px] text-fg-faint">{i + 1}</span>
              <input
                value={e.name}
                onChange={(ev) => patch(e.id, { name: ev.target.value })}
                placeholder="Liikkeen nimi"
                className="min-w-0 flex-1 rounded-input border border-white/10 bg-black/[0.45] px-[11px] py-2 text-sm text-text"
              />
              <button
                onClick={() => setExercises((prev) => prev.filter((x) => x.id !== e.id))}
                aria-label="Poista liike"
                className="icon-btn flex min-h-0 min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className={label}>Sarjat</label>
                <input
                  inputMode="numeric"
                  value={e.defaultSets}
                  onChange={(ev) => patch(e.id, { defaultSets: toInt(ev.target.value) ?? 0 })}
                  className={numInput}
                />
              </div>
              <div className="col-span-2">
                <label className={label}>Toistot</label>
                <div className="flex items-center gap-1">
                  <input
                    inputMode="numeric"
                    placeholder="–"
                    value={e.repRange?.min ?? ''}
                    onChange={(ev) =>
                      patch(e.id, { repRange: { min: toInt(ev.target.value) ?? 0, max: e.repRange?.max ?? 0 } })
                    }
                    className={numInput}
                  />
                  <span className="text-fg-faint">–</span>
                  <input
                    inputMode="numeric"
                    placeholder="–"
                    value={e.repRange?.max ?? ''}
                    onChange={(ev) =>
                      patch(e.id, { repRange: { min: e.repRange?.min ?? 0, max: toInt(ev.target.value) ?? 0 } })
                    }
                    className={numInput}
                  />
                </div>
              </div>
              <div>
                <label className={label}>Paino</label>
                <input
                  inputMode="decimal"
                  placeholder="kg"
                  value={e.defaultWeight ?? ''}
                  onChange={(ev) =>
                    patch(e.id, { defaultWeight: ev.target.value === '' ? undefined : Number(ev.target.value) })
                  }
                  className={numInput}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <button
        onClick={() => setExercises((prev) => [...prev, blankExercise()])}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-row border border-dashed border-white/[0.14] bg-transparent px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-fg-muted"
      >
        <Plus size={15} /> Lisää liike
      </button>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-white/[0.08] bg-[rgba(5,6,12,0.82)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 [backdrop-filter:blur(20px)]">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Peru</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            <Check size={16} /> Tallenna pohja
          </Button>
        </div>
      </div>
    </div>
  )
}
