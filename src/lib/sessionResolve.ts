// Turning a template into today's actual session.
//
// Resolution order is fixed and matters:
//
//   1. ENVIRONMENT decides *which movement* — the room either has the kit or
//      it does not, and no amount of feeling good conjures a plyo box.
//   2. The BODY GATE decides *at what intensity* — applied to whatever
//      movement step 1 left standing.
//
// Doing it the other way round would pick an intensity for a movement that
// cannot be performed. Running them independently would lose the interaction
// the user actually wants: if the room forces the archer pull-up and the wrist
// gate says hybrid, the answer is a gentler archer pull-up, not a choice
// between the two.
//
// The output is a finished session. Nothing on screen should need
// interpreting: no "if your knee hurts, do X instead" left for the user to
// resolve while holding a kettlebell.

import type {
  GateSpec, LoggedExercise, Prescription, SetEntry, TemplateExercise, WorkoutTemplate, Workout,
} from './workouts'
import { uid } from './workouts'
import type { GateState, GateStates } from './gates'
import type { TrainingLocation } from './locations'
import { locationHas } from './locations'

/** Order the gate falls back through when a template omits a variant. A
 *  template that defines only develop and treat should give treat to a hybrid
 *  day, not silently give develop — the milder-but-present option is the safe
 *  reading. */
const VARIANT_FALLBACK: Record<GateState, Array<'develop' | 'hybrid' | 'treat' | 'rest'>> = {
  develop: ['develop'],
  hybrid: ['hybrid', 'treat', 'develop'],
  treat: ['treat', 'hybrid', 'develop'],
  rest: ['rest', 'treat', 'hybrid'],
  // Escalate never picks a variant: the region's loading work is dropped
  // outright and the rest of the session runs at develop.
  escalate: ['develop'],
}

export type VariantKey = 'develop' | 'hybrid' | 'treat' | 'rest'

/** Which of a gate's variants a given state actually lands on, following the
 *  same fall-through the resolver uses. The instructions sheet needs this to
 *  mark the line the session came from: showing all four variants without
 *  saying which one is today's would leave the reader doing the resolution by
 *  hand, which is the thing this app exists to avoid. Null means the slot is
 *  switched off in that state. */
export function pickedVariant(gate: GateSpec, state: GateState): VariantKey | null {
  if (state === 'escalate') return null
  for (const key of VARIANT_FALLBACK[state]) {
    if (!(key in gate.variants)) continue
    return gate.variants[key] === null ? null : key
  }
  return gate.variants.develop === null ? null : 'develop'
}

function repsLow(p: Prescription): number | undefined {
  if (p.reps == null) return undefined
  return typeof p.reps === 'number' ? p.reps : p.reps.min
}

function repsLabel(p: Prescription): string | undefined {
  if (p.reps == null) return undefined
  return typeof p.reps === 'number' ? `${p.reps}` : `${p.reps.min}–${p.reps.max}`
}

/** Seed a set from a prescription. Ranges seed at the low end; the logger is
 *  for recording what happened, and starting at the top of a range invites
 *  leaving a number that was never earned. */
function setsFrom(p: Prescription): SetEntry[] {
  const n = Math.max(1, p.sets)
  const base: SetEntry = {}
  const r = repsLow(p)
  if (r != null) base.reps = r
  if (p.holdSeconds != null) base.duration = p.holdSeconds
  return Array.from({ length: n }, () => ({ ...base }))
}

/** A template exercise's own defaults expressed as a prescription, so the
 *  ungated path and the gated path build sets the same way. */
function baseOf(te: TemplateExercise): Prescription {
  return {
    name: te.name,
    sets: te.defaultSets,
    reps: te.repRange,
    holdSeconds: te.defaultDuration,
    tempo: te.tempo,
    note: te.note,
  }
}

export interface ResolveInput {
  template: WorkoutTemplate
  location: TrainingLocation | null
  gates: GateStates
  /** Previously logged sets, keyed by exercise name, for prefill. */
  lastSetsFor?: (name: string) => SetEntry[] | null
}

/** Guard against a fallback chain that loops back on itself through hand-edited
 *  data. Eight steps is far past any real equipment ladder. */
const MAX_ENV_DEPTH = 8

/** Follow a prescription's equipment requirement — and the requirement of
 *  whatever it falls back to — until something the room actually supports is
 *  left standing.
 *
 *  The chaining is the point. Equipment substitution is a ladder, not a single
 *  step: no trap bar means the straight-bar RDL, and no external load at all
 *  means the bodyweight version. A one-step fallback would hand someone
 *  training in a park the straight-bar RDL, which is just as impossible as the
 *  trap bar was. A null anywhere in the chain ends it: the slot is dropped. */
function resolveChain(
  p: Prescription | null,
  location: TrainingLocation | null,
  depth = 0,
): { prescription: Prescription | null; envFallback: boolean } {
  if (p === null) return { prescription: null, envFallback: true }
  if (!p.env) return { prescription: p, envFallback: depth > 0 }
  if (depth >= MAX_ENV_DEPTH) return { prescription: null, envFallback: true }
  const missing = p.env.requires.filter((cap) => !locationHas(location, cap))
  if (missing.length === 0) return { prescription: p, envFallback: depth > 0 }
  const next = resolveChain(p.env.fallback, location, depth + 1)
  return { prescription: next.prescription, envFallback: true }
}

/** What the room does to one movement. */
function resolveEnv(
  te: TemplateExercise,
  location: TrainingLocation | null,
): { prescription: Prescription | null; envFallback: boolean } {
  if (!te.env) return { prescription: baseOf(te), envFallback: false }
  const missing = te.env.requires.filter((cap) => !locationHas(location, cap))
  if (missing.length === 0) return { prescription: baseOf(te), envFallback: false }
  return { prescription: resolveChain(te.env.fallback, location, 1).prescription, envFallback: true }
}

interface GateResult {
  prescription: Prescription | null
  envFallback: boolean
  /** Why the slot is empty, when it is. A variant that needs kit the room does
   *  not have reads "ei mahdollinen täällä"; a variant the gate switched off
   *  reads "pois tänään". Conflating them would tell someone to find a different
   *  gym when the real answer is to come back when the joint settles. */
  unavailable?: 'env' | 'gate'
}

function resolveGate(
  gate: GateSpec,
  state: GateState,
  envPrescription: Prescription,
  envFallback: boolean,
  location: TrainingLocation | null,
): GateResult {
  // The room already changed the movement, so the gate's named variants no
  // longer describe it. Keep the substitute and apply the gate as a volume
  // reduction instead — a gentler archer pull-up, not a jump back to the
  // barred original.
  if (envFallback) {
    if (state === 'rest' || state === 'escalate') {
      return { prescription: null, envFallback: true, unavailable: 'gate' }
    }
    if (state === 'develop') return { prescription: envPrescription, envFallback: true }
    const factor = state === 'treat' ? 0.5 : 0.75
    return {
      prescription: {
        ...envPrescription,
        sets: Math.max(1, Math.round(envPrescription.sets * factor)),
        note: [envPrescription.note, state === 'treat' ? 'hoitava: kevennä kuormaa' : 'hybridi: pidä 2–3 RIR']
          .filter(Boolean)
          .join(' · '),
      },
      envFallback: true,
    }
  }

  if (state === 'escalate') return { prescription: null, envFallback: false, unavailable: 'gate' }

  let picked: Prescription | null | undefined
  for (const key of VARIANT_FALLBACK[state]) {
    if (!(key in gate.variants)) continue
    picked = gate.variants[key]
    break
  }
  if (picked === undefined) picked = gate.variants.develop
  if (picked === null) return { prescription: null, envFallback: false, unavailable: 'gate' }
  // The chosen variant may itself need kit the room does not have, and its
  // substitute may need kit too — walk the whole chain. A variant whose chain
  // ends in null is a movement this room cannot host at this intensity: the
  // parallette holds are exactly this, dropped rather than swapped for a floor
  // version the wrist cannot take.
  const chained = resolveChain(picked, location)
  if (chained.prescription === null) return { ...chained, unavailable: 'env' }
  return chained
}

function toLogged(
  te: TemplateExercise,
  raw: Prescription,
  resolution: LoggedExercise['resolution'],
  lastSetsFor?: (name: string) => SetEntry[] | null,
): LoggedExercise {
  // A variant saved without a name would otherwise reach the logger nameless.
  const p: Prescription = raw.name.trim() ? raw : { ...raw, name: te.name }
  // Interval work is clocked rather than counted; its sets are plain markers.
  if (te.interval) {
    return {
      id: uid(),
      name: p.name,
      sets: Array.from({ length: Math.max(1, p.sets) }, () => ({})),
      interval: { ...te.interval },
      tempo: p.tempo,
      note: p.note,
      resolution,
    }
  }
  // Prefill from the last time this exact movement was logged, but only when
  // the plan did not change: a substituted movement carries its own numbers.
  // Prefill only when the plan is unchanged: an ungated slot, or a gated one
  // sitting at develop. A substituted or reduced movement carries its own
  // numbers, and inheriting last week's load into a treat variant would be
  // exactly the wrong suggestion.
  const planChanged =
    resolution?.envFallback === true ||
    (resolution?.gateState != null && resolution.gateState !== 'develop')
  const last = planChanged ? null : lastSetsFor?.(p.name)
  const sets = last && last.length > 0 ? last : setsFrom(p)
  return {
    id: uid(),
    name: p.name,
    sets,
    tempo: p.tempo,
    note: [p.note, repsLabel(p) ? `${p.sets} × ${repsLabel(p)}` : null].filter(Boolean).join(' · ') || undefined,
    resolution,
  }
}

/** Resolve every exercise in a template against the room and the body. */
export function resolveExercises(input: ResolveInput): LoggedExercise[] {
  const { template, location, gates, lastSetsFor } = input

  return template.exercises.map((te) => {
    const env = resolveEnv(te, location)

    // Not possible here at all, and no substitute offered.
    if (env.prescription === null) {
      return {
        id: uid(),
        name: te.name,
        sets: [],
        resolution: {
          baseName: te.name,
          slotId: te.id,
          gateRegion: te.gate?.bodyRegion,
          envFallback: true,
          unavailable: 'env',
          source: 'inferred',
        },
      }
    }

    if (!te.gate) {
      return toLogged(te, env.prescription, {
        baseName: te.name,
        slotId: te.id,
        envFallback: env.envFallback,
        source: 'inferred',
      }, lastSetsFor)
    }

    const state = gates[te.gate.bodyRegion].state
    const g = resolveGate(te.gate, state, env.prescription, env.envFallback, location)

    if (g.prescription === null) {
      return {
        id: uid(),
        name: env.prescription.name,
        sets: [],
        resolution: {
          baseName: te.name,
          slotId: te.id,
          gateRegion: te.gate.bodyRegion,
          gateState: state,
          envFallback: env.envFallback || g.envFallback,
          unavailable: g.unavailable ?? 'gate',
          source: gates[te.gate.bodyRegion].source,
        },
      }
    }

    return toLogged(te, g.prescription, {
      baseName: te.name,
      slotId: te.id,
      gateRegion: te.gate.bodyRegion,
      gateState: state,
      envFallback: env.envFallback || g.envFallback,
      source: gates[te.gate.bodyRegion].source,
    }, lastSetsFor)
  })
}

/** Re-resolve a single slot to a chosen state, for a mid-session change of
 *  mind ("it started aching in the warm-up"). Keeps everything else. */
export function reresolveExercise(
  te: TemplateExercise,
  location: TrainingLocation | null,
  state: GateState,
): LoggedExercise {
  const env = resolveEnv(te, location)
  if (env.prescription === null) {
    return {
      id: uid(),
      name: te.name,
      sets: [],
      resolution: { baseName: te.name, slotId: te.id, envFallback: true, unavailable: 'env', source: 'manual' },
    }
  }
  if (!te.gate) {
    return toLogged(te, env.prescription, {
      baseName: te.name,
      slotId: te.id,
      envFallback: env.envFallback,
      source: 'manual',
    })
  }
  const g = resolveGate(te.gate, state, env.prescription, env.envFallback, location)
  if (g.prescription === null) {
    return {
      id: uid(),
      name: env.prescription.name,
      sets: [],
      resolution: {
        baseName: te.name,
        slotId: te.id,
        gateRegion: te.gate.bodyRegion,
        gateState: state,
        envFallback: env.envFallback || g.envFallback,
        unavailable: 'gate',
        source: 'manual',
      },
    }
  }
  return toLogged(te, g.prescription, {
    baseName: te.name,
    slotId: te.id,
    gateRegion: te.gate.bodyRegion,
    gateState: state,
    envFallback: env.envFallback || g.envFallback,
    source: 'manual',
  })
}

/** Does this session need the professional-referral banner? */
export function hasEscalation(w: Workout): boolean {
  return (w.assessments ?? []).some((a) => a.gateOutput === 'escalate')
}
