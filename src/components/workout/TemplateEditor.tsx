import { useState } from 'react'
import { ChevronLeft, Plus, Trash2, Check, Dumbbell, Timer, GripVertical } from 'lucide-react'
import { Card, CARD_CLASSES, Button, DragItem, useDragReorder, moveById, moveByDelta } from '../ui'
import type { WorkoutTemplate, TemplateExercise, TemplateKind, IntervalConfig } from '../../lib/workouts'
import type { TrainingBlock } from '../../lib/blocks'
import { GateEditor } from './GateEditor'
import { uid, TEMPLATE_COLORS, DEFAULT_TEMPLATE_COLOR } from '../../lib/workouts'

interface Props {
  initial?: WorkoutTemplate
  /** Blokit joihin pohjan voi sitoa. Tyhjä lista piilottaa valinnan kokonaan —
   *  sidonta ilman blokkeja ei tarkoita mitään. */
  blocks?: TrainingBlock[]
  onSave: (template: WorkoutTemplate) => void
  onCancel: () => void
}

const label = 'mb-1 block text-[12px] leading-4 text-fg-muted'
const numInput =
  'h-11 w-full min-w-0 rounded-[10px] border border-white/[0.18] bg-[var(--surface-2)] px-1.5 text-center font-mono text-[16px] tabular-nums text-text [color-scheme:dark]'

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

export function TemplateEditor({ initial, blocks = [], onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<TemplateKind>(initial?.kind ?? 'strength')
  const [color, setColor] = useState<string>(initial?.color ?? DEFAULT_TEMPLATE_COLOR)
  const [blockId, setBlockId] = useState<string | null>(initial?.blockId ?? null)
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
      blockId,
      exercises: cleaned,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <div className="px-4 pb-28 pt-2">
      {/* Header */}
      <div className="mb-3 flex items-center gap-1">
        <button
          onClick={onCancel}
          aria-label="Takaisin"
          className="icon-btn flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-text"
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-[22px] font-medium leading-7 text-text">
          {initial ? 'Muokkaa pohjaa' : 'Uusi pohja'}
        </h2>
      </div>

      {/* Name */}
      <Card variant="panel" className="mb-2.5 !p-4">
        <label className={label}>Pohjan nimi</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="esim. Push A"
          autoFocus
          className="w-full min-h-12 rounded-[12px] border border-white/[0.18] bg-[var(--surface-2)] px-[14px] py-[11px] text-[16px] text-text [color-scheme:dark]"
        />

        <label className={`${label} mt-3`}>Tyyppi</label>
        <div role="radiogroup" aria-label="Tyyppi" className="flex gap-1 rounded-[24px] border border-white/[0.08] bg-[var(--surface-2)] p-1">
          {([
            { id: 'strength' as const, text: 'Voima', Icon: Dumbbell },
            { id: 'mobility' as const, text: 'Liikkuvuus', Icon: Timer },
          ]).map((k) => (
            <button
              key={k.id}
              onClick={() => switchKind(k.id)}
              role="radio"
              aria-checked={kind === k.id}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[20px] text-[14px] font-medium transition-colors ${
                kind === k.id ? 'bg-cyan/[0.18] text-[#a5f3fc]' : 'text-fg-muted'
              }`}
            >
              <k.Icon size={16} /> {k.text}
            </button>
          ))}
        </div>

        {blocks.length > 0 && (
          <>
            <label className={`${label} mt-3`}>Käytössä blokissa</label>
            <select
              value={blockId ?? ''}
              onChange={(e) => setBlockId(e.target.value === '' ? null : e.target.value)}
              className="w-full min-h-12 rounded-[12px] border border-white/[0.18] bg-[var(--surface-2)] px-[14px] py-[11px] text-[16px] text-text [color-scheme:dark]"
            >
              <option value="">Aina käytössä</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.startDate.slice(8, 10)}.{b.startDate.slice(5, 7)}.
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] leading-4 text-fg-muted">
              Blokkiin sidottu pohja on näkyvissä ja muokattavissa heti, mutta tarjolla vasta kun
              se blokki on menossa.
            </p>
          </>
        )}

        <label className={`${label} mt-3`}>Väri</label>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Väri ${c}`}
              aria-pressed={color === c}
              className={`h-11 w-11 rounded-full transition-transform ${
                color === c ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Card>

      {/* Exercises */}
      <div className="mb-2 mt-4 px-1 text-[16px] font-medium leading-6 text-text">
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
            className={`${CARD_CLASSES.panel} !p-4`}
          >
            {({ handleProps }) => (
              <>
                <div className="mb-2.5 flex items-center gap-2">
                  <div
                    {...handleProps}
                    className="-m-1.5 flex flex-shrink-0 cursor-grab touch-none items-center gap-1 p-1.5 active:cursor-grabbing"
                  >
                    <GripVertical size={16} className="text-fg-muted" />
                    <span className="font-mono text-[14px] text-fg-muted">{i + 1}</span>
                  </div>
                  <input
                    value={e.name}
                    onChange={(ev) => patch(e.id, { name: ev.target.value })}
                    placeholder="Liikkeen nimi"
                    className="h-12 min-w-0 flex-1 rounded-[12px] border border-white/[0.18] bg-[var(--surface-2)] px-3 text-[16px] text-text"
                  />
                  <button
                    onClick={() => setExercises((prev) => prev.filter((x) => x.id !== e.id))}
                    aria-label="Poista liike"
                    className="icon-btn flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-danger"
                  >
                    <Trash2 size={18} />
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
                      aria-pressed={e.interval?.perSide === true}
                      className={`mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[8px] border px-3 text-[14px] font-medium transition-colors ${
                        e.interval?.perSide
                          ? 'border-transparent bg-cyan/[0.16] text-[#a5f3fc]'
                          : 'border-white/[0.18] bg-transparent text-text'
                      }`}
                    >
                      <Check size={16} className={e.interval?.perSide ? '' : 'opacity-30'} />
                      Molemmille puolille (esim. per puoli tai käsi)
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
                        <span className="text-fg-muted">–</span>
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
        className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/[0.18] bg-transparent px-4 text-[14px] font-medium text-text"
      >
        <Plus size={18} /> Lisää liike
      </button>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-white/[0.08] bg-[#0c0d18] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
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
