import { useState } from 'react'
import { ChevronDown, ChevronRight, Ban, Check } from 'lucide-react'
import type { EnvRequirement, GateSpec, Prescription } from '../../lib/workouts'
import { ALL_REGIONS, REGION_LABEL, GATE_LABEL } from '../../lib/gates'
import type { BodyRegion } from '../../lib/gates'
import { CAPABILITIES, CAPABILITY_LABEL } from '../../lib/locations'
import type { Capability } from '../../lib/locations'

// Editing the two rules that make a slot adaptive: what the room must provide,
// and which body region sets the intensity.
//
// Both are collapsed by default and absent by default. A template that says
// nothing about either behaves exactly as templates always have, so the extra
// power costs nothing to anyone not using it — which is the only reason it is
// safe to put this much machinery on an exercise row.

const label = 'mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const field =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-2 text-base text-text [color-scheme:dark]'
const num = `${field} text-center tabular-nums`

const toInt = (v: string): number | undefined => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

type VariantKey = 'develop' | 'hybrid' | 'treat' | 'rest'
const VARIANT_ORDER: VariantKey[] = ['develop', 'hybrid', 'treat', 'rest']

const VARIANT_HINT: Record<VariantKey, string> = {
  develop: 'Täysi kuorma. Tämä on aina määriteltävä.',
  hybrid: 'Kevennetty, mutta samaa työtä.',
  treat: 'Hoitava: kuormaa pois, liikettä lisää.',
  rest: 'Vain polvella. Selällä ei ole lepotilaa.',
}

export function emptyPrescription(name: string): Prescription {
  return { name, sets: 3 }
}

// ── Prescription ───────────────────────────────────────────────────────────

function PrescriptionFields({
  value,
  onChange,
  compact = false,
}: {
  value: Prescription
  onChange: (p: Prescription) => void
  compact?: boolean
}) {
  const reps = typeof value.reps === 'number' ? { min: value.reps, max: value.reps } : value.reps
  return (
    <>
      <input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Liikkeen nimi"
        className={`${field} mb-1.5`}
      />
      <div className="mb-1.5 grid grid-cols-4 gap-1.5">
        <div>
          <label className={label}>Sarjat</label>
          <input
            inputMode="numeric"
            value={value.sets}
            onChange={(e) => onChange({ ...value, sets: toInt(e.target.value) ?? 1 })}
            className={num}
          />
        </div>
        <div className="col-span-2">
          <label className={label}>Toistot</label>
          <div className="flex items-center gap-1">
            <input
              inputMode="numeric"
              placeholder="–"
              value={reps?.min ?? ''}
              onChange={(e) => {
                const min = toInt(e.target.value)
                if (min == null) return onChange({ ...value, reps: undefined })
                onChange({ ...value, reps: { min, max: reps?.max ?? min } })
              }}
              className={num}
            />
            <span className="text-fg-faint">–</span>
            <input
              inputMode="numeric"
              placeholder="–"
              value={reps?.max ?? ''}
              onChange={(e) =>
                onChange({ ...value, reps: { min: reps?.min ?? 0, max: toInt(e.target.value) ?? 0 } })
              }
              className={num}
            />
          </div>
        </div>
        <div>
          <label className={label}>Pito s</label>
          <input
            inputMode="numeric"
            placeholder="–"
            value={value.holdSeconds ?? ''}
            onChange={(e) => onChange({ ...value, holdSeconds: toInt(e.target.value) })}
            className={num}
          />
        </div>
      </div>
      {!compact && (
        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
          <input
            value={value.tempo ?? ''}
            onChange={(e) => onChange({ ...value, tempo: e.target.value || undefined })}
            placeholder="Tempo, esim. 3-0-X"
            className={field}
          />
          <input
            value={value.note ?? ''}
            onChange={(e) => onChange({ ...value, note: e.target.value || undefined })}
            placeholder="Huomio"
            className={field}
          />
        </div>
      )}
    </>
  )
}

// ── Environment ────────────────────────────────────────────────────────────

/** How many substitutions deep the editor will let a slot go. Three covers the
 *  real ladders (trap bar → straight bar → bodyweight) and stops the row from
 *  becoming an infinitely nestable form. */
const MAX_ENV_DEPTH = 3

export function EnvFields({
  value,
  onChange,
  title,
  seedName = '',
  depth = 0,
}: {
  value: EnvRequirement | undefined
  onChange: (e: EnvRequirement | undefined) => void
  title: string
  /** Seeds a new fallback's name. An empty one would resolve to a nameless
   *  movement in the session, which is worse than a wrong-but-editable guess. */
  seedName?: string
  /** Substitution depth. A substitute can need kit of its own, so the form
   *  recurses exactly as the resolver does — otherwise the second and third
   *  rungs of a ladder exist in the data and are invisible here. */
  depth?: number
}) {
  const requires = value?.requires ?? []
  const toggle = (cap: Capability) => {
    const next = requires.includes(cap) ? requires.filter((c) => c !== cap) : [...requires, cap]
    if (next.length === 0) return onChange(undefined)
    onChange({ requires: next, fallback: value?.fallback ?? emptyPrescription(seedName) })
  }

  return (
    <div className="rounded-[8px] border border-white/[0.08] bg-black/25 p-2.5">
      <div className={label}>{title}</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {CAPABILITIES.map((cap) => {
          const on = requires.includes(cap)
          return (
            <button
              key={cap}
              onClick={() => toggle(cap)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-[10px] !min-h-0 !min-w-0 ${
                on ? 'border-accent/45 bg-accent/[0.12] text-text' : 'border-white/10 text-fg-muted'
              }`}
            >
              {CAPABILITY_LABEL[cap]}
            </button>
          )
        })}
      </div>

      {requires.length > 0 && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <span className={label}>Kun varustetta ei ole</span>
            <button
              onClick={() =>
                onChange({
                  requires,
                  fallback: value?.fallback === null ? emptyPrescription(seedName) : null,
                })
              }
              className={`rounded-full border px-2.5 py-1 text-[10px] !min-h-0 !min-w-0 ${
                value?.fallback === null
                  ? 'border-danger/45 bg-danger/[0.10] text-danger'
                  : 'border-white/10 text-fg-muted'
              }`}
            >
              <Ban size={10} className="mr-1 inline" />
              Ei mahdollinen
            </button>
          </div>
          {value?.fallback === null ? (
            <p className="m-0 text-[10px] leading-snug text-fg-faint">
              Liike jää pois tässä paikassa. Rivi näkyy silti treenissä yliviivattuna.
            </p>
          ) : (
            <>
              <PrescriptionFields
                value={value?.fallback ?? emptyPrescription(seedName)}
                onChange={(p) => onChange({ requires, fallback: p })}
              />
              <p className="m-0 mb-1.5 text-[10px] leading-snug text-fg-ghost">
                Säilytä teho vaikeammalla vipuvarrella tai hitaammalla tempolla — ei lisäämällä
                toistoja.
              </p>
              {depth + 1 < MAX_ENV_DEPTH && (
                <EnvFields
                  value={value?.fallback?.env}
                  onChange={(e) =>
                    onChange({
                      requires,
                      fallback: { ...(value?.fallback ?? emptyPrescription(seedName)), env: e },
                    })
                  }
                  title="Korvaaja vaatii paikalta"
                  seedName={value?.fallback?.name || seedName}
                  depth={depth + 1}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Gate ───────────────────────────────────────────────────────────────────

export function GateEditor({
  gate,
  onChange,
  env,
  onEnvChange,
  exerciseName,
}: {
  gate: GateSpec | undefined
  onChange: (g: GateSpec | undefined) => void
  env: EnvRequirement | undefined
  onEnvChange: (e: EnvRequirement | undefined) => void
  exerciseName: string
}) {
  const [open, setOpen] = useState(false)
  const active = Boolean(gate) || Boolean(env)

  const setRegion = (region: BodyRegion | null) => {
    if (region === null) return onChange(undefined)
    if (gate) return onChange({ ...gate, bodyRegion: region })
    onChange({
      bodyRegion: region,
      variants: { develop: emptyPrescription(exerciseName || '') },
    })
  }

  const setVariant = (key: VariantKey, p: Prescription | null | undefined) => {
    if (!gate) return
    const variants = { ...gate.variants }
    if (p === undefined) delete variants[key]
    else if (key === 'develop') variants.develop = p ?? emptyPrescription(exerciseName)
    else variants[key] = p
    onChange({ ...gate, variants })
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-[8px] border border-white/[0.08] px-2.5 py-2 text-left !min-h-0"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="flex-1 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-dim">
          Portti ja paikka
        </span>
        {active && (
          <span className="font-mono text-[9px] text-accent">
            {[gate && REGION_LABEL[gate.bodyRegion].toLowerCase(), env && 'paikka']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          <EnvFields
            value={env}
            onChange={onEnvChange}
            title="Liike vaatii paikalta"
            seedName={exerciseName}
          />

          <div className="rounded-[8px] border border-white/[0.08] bg-black/25 p-2.5">
            <div className={label}>Päiväarvio ohjaa tätä liikettä</div>
            <div className="mb-2 flex flex-wrap gap-1">
              <button
                onClick={() => setRegion(null)}
                aria-pressed={!gate}
                className={`rounded-full border px-2.5 py-1 text-[10px] !min-h-0 !min-w-0 ${
                  !gate ? 'border-accent/45 bg-accent/[0.12] text-text' : 'border-white/10 text-fg-muted'
                }`}
              >
                Ei porttia
              </button>
              {ALL_REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  aria-pressed={gate?.bodyRegion === r}
                  className={`rounded-full border px-2.5 py-1 text-[10px] !min-h-0 !min-w-0 ${
                    gate?.bodyRegion === r
                      ? 'border-accent/45 bg-accent/[0.12] text-text'
                      : 'border-white/10 text-fg-muted'
                  }`}
                >
                  {REGION_LABEL[r]}
                </button>
              ))}
            </div>

            {gate &&
              VARIANT_ORDER.filter((k) => !(k === 'rest' && gate.bodyRegion === 'back')).map((key) => {
                const v = gate.variants[key]
                const defined = key === 'develop' || v !== undefined
                const droppedOut = v === null
                return (
                  <div key={key} className="mb-2 rounded-[6px] border border-white/[0.06] p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text">
                        {GATE_LABEL[key]}
                      </span>
                      <div className="flex gap-1">
                        {key !== 'develop' && (
                          <>
                            <button
                              onClick={() => setVariant(key, droppedOut ? emptyPrescription(exerciseName) : null)}
                              aria-pressed={droppedOut}
                              className={`rounded-full border px-2 py-0.5 text-[9px] !min-h-0 !min-w-0 ${
                                droppedOut
                                  ? 'border-danger/45 bg-danger/[0.10] text-danger'
                                  : 'border-white/10 text-fg-muted'
                              }`}
                            >
                              Pois tässä tilassa
                            </button>
                            <button
                              onClick={() => setVariant(key, defined ? undefined : emptyPrescription(exerciseName))}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-fg-muted !min-h-0 !min-w-0"
                            >
                              {defined ? 'Tyhjennä' : 'Määrittele'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!defined ? (
                      <p className="m-0 text-[10px] leading-snug text-fg-ghost">
                        Ei määritelty — käytetään lähintä määriteltyä tilaa. {VARIANT_HINT[key]}
                      </p>
                    ) : droppedOut ? (
                      <p className="m-0 flex items-center gap-1 text-[10px] text-fg-faint">
                        <Ban size={10} /> Liike jätetään pois tässä tilassa.
                      </p>
                    ) : (
                      <>
                        <PrescriptionFields
                          value={v ?? emptyPrescription(exerciseName)}
                          onChange={(p) => setVariant(key, p)}
                        />
                        <EnvFields
                          value={(v ?? undefined)?.env}
                          onChange={(e) => setVariant(key, { ...(v ?? emptyPrescription(exerciseName)), env: e })}
                          title="Tämä variantti vaatii paikalta"
                          seedName={(v ?? undefined)?.name || exerciseName}
                        />
                      </>
                    )}
                  </div>
                )
              })}

            {gate && (
              <p className="m-0 flex items-start gap-1 text-[10px] leading-snug text-fg-ghost">
                <Check size={10} className="mt-0.5 flex-shrink-0" />
                Paikka ratkaistaan ensin, sitten portti. Määrittelemätön tila putoaa lähimpään
                määriteltyyn.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
