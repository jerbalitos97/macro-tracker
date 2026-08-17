import { useState } from 'react'
import { ChevronLeft, Plus, Trash2, Check, Dumbbell, Timer, GripVertical } from 'lucide-react'
import { Card, CARD_CLASSES, Button, DragItem, useDragReorder, moveById, moveByDelta } from '../ui'
import type { WorkoutTemplate, TemplateExercise, TemplateKind, IntervalConfig } from '../../lib/workouts'
import { GateEditor } from './GateEditor'
import { uid, TEMPLATE_COLORS, DEFAULT_TEMPLATE_COLOR } from '../../lib/workouts'

interface Props {
  initial?: WorkoutTemplate
  onSave: (template: WorkoutTemplate) => void
  onCancel: () => void
}

const label = 'mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const numInput =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-2 text-center text-sm tabular-nums text-text [color-scheme:dark]'

const DEFAULT_INTERVAL: IntervalConfig = { workSeconds: 10, restSeconds: 5, rounds: 3, perSide: true }

function blankExercise(kind: TemplateKind): TemplateExercise {
  if (kind === 'mobility') {
    return { id: uid(), name: '', defaultSets: 3, interval: { ...DEFAULT_INTERVAL } }
  }
  return { id: uid(), name: '', defaultSets: 3, repRange: { min: 8, max: 12 } }
}

function toInt(v: string): number | undefined {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function TemplateEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<TemplateKind>(initial?.kind ?? 'strength')
  const [color, setColor] = useState<string>(initial?.color ?? DEFAULT_TEMPLATE_COLOR)
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    initial?.exercises.length ? initial.exercises.map((e) => ({ ...e })) : [blankExercise(initial?.kind ?? 'strength')],
  )

  const patch = (id: string, p: Partial<TemplateExercise>) =>
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)))

  // Drag from the grip only — the rows are full of text and number fields.
  const reorder = useDragReorder((fromId, toId) => setExercises((prev) => moveById(prev, fromId, toId)))
  const move = (id: string, delta: -1 | 1) => setExercises((prev) => moveByDelta(prev, id, delta))

  const patchInterval = (id: string, p: Partial<IntervalConfig>) =>
    setExercises((prev) =>
      prev.map((e) => (e.id === id ? { ...e, interval: { ...(e.interval ?? DEFAULT_INTERVAL), ...p } } : e)),
    )

  const switchKind = (k: TemplateKind) => {
    setKind(k)
    // Give every exercise the fields the new kind needs.
    setExercises((prev) =>
      prev.map((e) =>
        k === 'mobility'
          ? { ...e, interval: e.interval ?? { ...DEFAULT_INTERVAL } }
          : { ...e, interval: undefined },
      ),
    )
  }

  const canSave = name.trim().length > 0 && exercises.some((e) => e.name.trim().length > 0)

  const handleSave = () => {
    if (!canSave) return
    const now = new Date().toISOString()
    const cleaned = exercises
      .filter((e) => e.name.trim().length > 0)
      .map((e) => {
        const base = { ...e, name: e.name.trim(), defaultSets: Math.max(1, e.defaultSets || 1) }
        if (kind === 'mobility') {
          const iv = e.interval ?? DEFAULT_INTERVAL
          return {
            ...base,
            repRange: undefined,
            defaultWeight: undefined,
            defaultDuration: undefined,
            interval: {
              workSeconds: Math.max(1, iv.workSeconds || 1),
              restSeconds: Math.max(0, iv.restSeconds || 0),
              rounds: Math.max(1, iv.rounds || 1),
              perSide: iv.perSide,
            },
          }
        }
        return { ...base, interval: undefined }
      })
    onSave({
      // Spread the original first: this editor only owns name, kind, colour
      // and exercises, and listing the survivors by hand silently dropped
      // everything it did not know about — the manual ordering, the block
      // note, and (once archiving existed) the archived flag, which meant
      // editing an archived template quietly brought it back.
      ...initial,
      id: initial?.id ?? uid(),
      name: name.trim(),
      kind,
      color,
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

        <label className={`${label} mt-3`}>Tyyppi</label>
        <div className="grid grid-cols-2 gap-1 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-1">
          {([
            { id: 'strength' as const, text: 'Voima', Icon: Dumbbell },
            { id: 'mobility' as const, text: 'Liikkuvuus', Icon: Timer },
          ]).map((k) => (
            <button
              key={k.id}
              onClick={() => switchKind(k.id)}
              className={`flex min-h-0 items-center justify-center gap-1.5 rounded-[14px] py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                kind === k.id ? 'bg-gradient-to-br from-cyan to-violet text-bg' : 'text-fg-muted'
              }`}
            >
              <k.Icon size={13} /> {k.text}
            </button>
          ))}
        </div>

        <label className={`${label} mt-3`}>Väri</label>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Väri ${c}`}
              className={`h-8 w-8 !min-h-0 !min-w-0 rounded-full transition-transform ${
                color === c ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Card>

      {/* Exercises */}
      <div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim">
        Liikkeet ({exercises.length})
      </div>
      <div ref={reorder.containerRef} className="flex flex-col gap-2.5">
        {exercises.map((e, i) => (
          <DragItem
            key={e.id}
            id={e.id}
            reorder={reorder}
            onMove={(d) => move(e.id, d)}
            tabIndex={0}
            ariaLabel={`Liike ${i + 1}: ${e.name || 'nimetön'}`}
            className={CARD_CLASSES.panel}
          >
            {({ handleProps }) => (
              <>
                <div className="mb-2.5 flex items-center gap-2">
                  <div
                    {...handleProps}
                    className="-m-1.5 flex flex-shrink-0 cursor-grab touch-none items-center gap-1 p-1.5 active:cursor-grabbing"
                  >
                    <GripVertical size={15} className="text-fg-faint" />
                    <span className="font-mono text-[10px] text-fg-faint">{i + 1}</span>
                  </div>
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
                {kind === 'mobility' ? (
                  <>
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
                      <div>
                        <label className={label}>Contr. s</label>
                        <input
                          inputMode="numeric"
                          value={e.interval?.workSeconds ?? ''}
                          onChange={(ev) => patchInterval(e.id, { workSeconds: toInt(ev.target.value) ?? 0 })}
                          className={numInput}
                        />
                      </div>
                      <div>
                        <label className={label}>Lepo s</label>
                        <input
                          inputMode="numeric"
                          value={e.interval?.restSeconds ?? ''}
                          onChange={(ev) => patchInterval(e.id, { restSeconds: toInt(ev.target.value) ?? 0 })}
                          className={numInput}
                        />
                      </div>
                      <div>
                        <label className={label}>Kierrot</label>
                        <input
                          inputMode="numeric"
                          value={e.interval?.rounds ?? ''}
                          onChange={(ev) => patchInterval(e.id, { rounds: toInt(ev.target.value) ?? 0 })}
                          className={numInput}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => patchInterval(e.id, { perSide: !(e.interval?.perSide ?? true) })}
                      className={`mt-2 flex min-h-0 w-full items-center justify-center gap-1.5 rounded-input border py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                        e.interval?.perSide
                          ? 'border-cyan/35 bg-cyan/[0.10] text-cyan'
                          : 'border-white/10 bg-[rgba(9,11,20,0.42)] text-fg-muted'
                      }`}
                    >
                      <Check size={12} className={e.interval?.perSide ? '' : 'opacity-30'} />
                      Molemmille puolille (esim. per jalka)
                    </button>
                  </>
                ) : (
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
                )}

                {/* Gate and environment. Collapsed and empty by default: a
                    template that says nothing about either behaves exactly as
                    templates always have. */}
                {kind !== 'mobility' && (
                  <GateEditor
                    exerciseName={e.name}
                    gate={e.gate}
                    onChange={(g) => patch(e.id, { gate: g })}
                    env={e.env}
                    onEnvChange={(en) => patch(e.id, { env: en })}
                  />
                )}
              </>
            )}
          </DragItem>
        ))}
      </div>

      <button
        onClick={() => setExercises((prev) => [...prev, blankExercise(kind)])}
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
