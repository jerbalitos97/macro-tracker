// Workout logging tool. Templates and completed-workout history sync to
// Supabase (workout_templates / workouts tables) with localStorage as the
// offline cache; the autosaved in-progress draft remains device-local.
import { supabase } from './supabase'
import type { Assessment, BodyRegion, GateState } from './gates'
import type { Capability } from './locations'

const K_TEMPLATES = 'mimir.workouts.templates:v1'
const K_HISTORY   = 'mimir.workouts.history:v1'
const K_DRAFT     = 'mimir.workouts.draft:v1'

// ── Types ────────────────────────────────────────────────────────────────────
export interface RepRange {
  min: number
  max: number
}

export type TemplateKind = 'strength' | 'mobility'

/** Timed interval definition for mobility work: alternating contraction and
 *  rest phases, repeated `rounds` times, optionally once per side (leg). */
export interface IntervalConfig {
  workSeconds: number
  restSeconds: number
  rounds: number
  perSide: boolean
}

/** What a movement needs from the room, and what to do when the room does not
 *  have it.
 *
 *  Substitution principle: when external load is missing, intensity is kept by
 *  a harder leverage or a slower tempo — never by adding reps. Heavy load is
 *  not replaceable for maximal strength (Schoenfeld 2017), and piling on reps
 *  would steer the same movement into an endurance adaptation, which is the
 *  opposite of what these blocks are for. */
export interface EnvRequirement {
  requires: Capability[]
  /** null means the movement simply is not possible here. */
  fallback: Prescription | null
}

/** Several movements offered side by side instead of resolved down to one.
 *
 *  Normally the room picks the movement. Sometimes the movement should pick the
 *  room: "Koti + Fitness 24/7" is one profile covering two buildings, and which
 *  one you walk into depends on what the session asks for. Resolving that to a
 *  single answer would hide the choice the plan is actually asking you to make,
 *  so the options are shown together, each labelled with where it can be done.
 *
 *  `requires` gates the whole group — no external load anywhere means no loaded
 *  hinge at all, and `fallback` takes over. */
export interface EnvOptions {
  requires: Capability[]
  /** Two or more parallel choices. Each should carry a placeLabel. */
  options: Prescription[]
  /** Used when `requires` is not met. null drops the slot. */
  fallback: Prescription | null
}

/** One prescription: a movement at a given intensity. Used both for gate
 *  variants and for environment fallbacks, because they are the same thing —
 *  "do this instead" — arrived at for different reasons. */
export interface Prescription {
  name: string
  sets: number
  /** A number or a range; the logger seeds from the low end of a range. */
  reps?: number | RepRange
  holdSeconds?: number
  tempo?: string
  note?: string
  /** A variant can need different kit from the movement it replaces — the
   *  loaded split squat needs weight, the treat variant needs an anchor. So
   *  the requirement lives on the prescription, not only on the slot. */
  env?: EnvRequirement
  /** Parallel options rather than a single answer. See EnvOptions. */
  envOptions?: EnvOptions
  /** Where this option can be done, shown next to it when options are offered
   *  side by side. Purely a label — the capability flags do the filtering. */
  placeLabel?: string
}

/** Gate control: which body region decides this movement's intensity, and what
 *  it becomes in each state. */
export interface GateSpec {
  bodyRegion: BodyRegion
  variants: {
    /** Always present: the gate has to have something to develop towards. */
    develop: Prescription
    /** null = the movement is left out in this state. Any state below develop
     *  can drop a movement — depth jumps have no treat version worth doing. */
    hybrid?: Prescription | null
    treat?: Prescription | null
    rest?: Prescription | null
  }
}

/** One exercise as defined in a template (the plan / defaults). */
export interface TemplateExercise {
  id: string
  name: string
  defaultSets: number
  repRange?: RepRange
  defaultWeight?: number    // kg
  defaultDuration?: number  // seconds
  interval?: IntervalConfig // mobility exercises only
  tempo?: string
  note?: string
  /** Optional and independent of each other: a movement can need equipment
   *  *and* be gated on a body region. Env resolves first (which movement),
   *  then the gate (at what intensity). Absent on every pre-existing template,
   *  which therefore behaves exactly as before. */
  env?: EnvRequirement
  /** Parallel place-specific choices instead of one resolved movement. */
  envOptions?: EnvOptions
  gate?: GateSpec
}

export interface WorkoutTemplate {
  id: string
  name: string
  kind?: TemplateKind       // default 'strength'
  color?: string            // hex accent shown on tiles and in the logger
  position?: number         // manual order within its kind; undefined = unsorted
  exercises: TemplateExercise[]
  /** Free-form planning note carried with the template. */
  note?: string
  /** The warm-up package run before the first exercise. It is not a numbered
   *  slot: a warm-up is a fixed routine you do or skip, not something you log
   *  set by set, and putting it in the list made it look like training volume. */
  warmupId?: string | null
  /** This session carries the once-a-week progressive dose of whichever warm-up
   *  items are marked progressive. Everywhere else they stay light. */
  warmupProgressive?: boolean
  /** Retired templates keep their history but leave the pickers. Null or
   *  absent means active. */
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

/** Palette offered when colour-coding a template. */
export const TEMPLATE_COLORS = [
  '#22d3ee', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#4ade80', '#60a5fa', '#f87171',
] as const

export const DEFAULT_TEMPLATE_COLOR = TEMPLATE_COLORS[0]

/** A single logged set. Every field is optional — a set may track any
 *  combination of reps, weight, and duration. */
export interface SetEntry {
  reps?: number
  weight?: number    // kg
  duration?: number  // seconds
  done?: boolean     // checked off in the logger
}

/** Why a logged exercise looks the way it does. Written at resolution time so
 *  a session can be read back months later and the variant explained. */
export interface Resolution {
  /** The template's own name for the slot, before any substitution. */
  baseName: string
  /** The template exercise this came from. Names are not unique — two slots can
   *  both be "Step downs" — so anything that has to find the slot again (the
   *  instructions sheet, a manual variant swap) matches on this. Absent on
   *  sessions logged before it existed, and on exercises added by hand. */
  slotId?: string
  gateRegion?: BodyRegion
  gateState?: GateState
  /** The room forced the fallback prescription. */
  envFallback?: boolean
  /** Present when the movement is not being done: 'env' = not possible here,
   *  'gate' = off today. The row still renders, struck through — a silent
   *  disappearance is indistinguishable from forgetting it. */
  unavailable?: 'env' | 'gate'
  /** 'manual' once the user overrode the resolved variant mid-session. */
  source: 'asked' | 'manual' | 'inferred'
}

/** One of several movements offered side by side, as the logger shows it. */
export interface LoggedAlternative {
  name: string
  /** Where it can be done — the point of showing them together. */
  placeLabel?: string
  /** "3 × 6–8" or "5 × 10 s", spelled out so the row can be compared at a
   *  glance without opening anything. */
  dose: string
  tempo?: string
  note?: string
}

export interface LoggedExercise {
  id: string
  name: string
  sets: SetEntry[]
  interval?: IntervalConfig // present when the exercise is clocked, not counted
  tempo?: string
  note?: string
  /** Present when the slot offered parallel choices. The active one is `name`;
   *  the others are one tap away. Kept on the logged record so a past session
   *  still shows what the alternative was. */
  alternatives?: LoggedAlternative[]
  resolution?: Resolution
}

/** An exercise counts as done once every set has been checked off. */
export function exerciseDone(ex: LoggedExercise): boolean {
  return ex.sets.length > 0 && ex.sets.every((s) => s.done === true)
}

/** Copy sets from a previous session as prefill: values carry over, the
 *  done flags do not — a new workout always starts unchecked. */
export function copySetsForNewSession(sets: SetEntry[]): SetEntry[] {
  return sets.map((s) => {
    const c = { ...s }
    delete c.done
    return c
  })
}

export interface Workout {
  id: string
  date: string            // ISO yyyy-mm-dd
  name: string
  templateId?: string
  color?: string          // inherited from the template it was started from
  exercises: LoggedExercise[]
  completed: boolean
  /** Ticked at the top of the logger. Only a fact that it happened — the
   *  routine itself lives in lib/warmup.ts and is not copied per session. */
  warmupDone?: boolean
  /** Where it was done — resolves which movements were possible. */
  locationId?: string
  /** The day's readiness readings and what each gate decided. Kept on the
   *  session so a variant can be traced to the number that caused it. */
  assessments?: Assessment[]
  createdAt: string
  updatedAt: string
}

// ── ids ──────────────────────────────────────────────────────────────────────
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

// ── Low-level JSON helpers ─────────────────────────────────────────────────────
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // best-effort; ignore quota/availability errors
  }
}

// ── Templates ──────────────────────────────────────────────────────────────────
/** Manual `position` first, then newest-first for templates never reordered. */
export function sortTemplates(list: WorkoutTemplate[]): WorkoutTemplate[] {
  return [...list].sort((a, b) => {
    const ap = a.position, bp = b.position
    if (ap != null && bp != null) return ap - bp
    if (ap != null) return -1
    if (bp != null) return 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** Every template, archived included. Callers that offer a choice should use
 *  activeTemplates(); this is for the archive view and the export. */
export function getTemplates(): WorkoutTemplate[] {
  const arr = read<WorkoutTemplate[]>(K_TEMPLATES, [])
  return Array.isArray(arr) ? sortTemplates(arr) : []
}

export const isArchived = (t: WorkoutTemplate): boolean => Boolean(t.archivedAt)

/** Templates a session can be started from. */
export function activeTemplates(): WorkoutTemplate[] {
  return getTemplates().filter((t) => !isArchived(t))
}

export function archivedTemplates(): WorkoutTemplate[] {
  return getTemplates()
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
}

/** Retire a template. Its logged sessions are untouched — a workout records
 *  what was done, not what the template currently says. */
export function setArchived(id: string, archived: boolean): WorkoutTemplate[] {
  const now = new Date().toISOString()
  const next = getTemplates().map((t) =>
    t.id === id ? { ...t, archivedAt: archived ? now : null, updatedAt: now } : t,
  )
  write(K_TEMPLATES, sortTemplates(next))
  return sortTemplates(next)
}

export function saveTemplate(t: WorkoutTemplate): WorkoutTemplate[] {
  const next = sortTemplates([...getTemplates().filter((x) => x.id !== t.id), t])
  write(K_TEMPLATES, next)
  return next
}

/** Persist an explicit order for one kind's templates. Positions are assigned
 *  per kind so reordering strength templates never disturbs mobility ones. */
export function reorderTemplates(kind: TemplateKind, orderedIds: string[]): WorkoutTemplate[] {
  const byId = new Map(orderedIds.map((id, i) => [id, i]))
  const next = getTemplates().map((t) => {
    const pos = byId.get(t.id)
    if (pos === undefined) return t
    const sameKind = (t.kind === 'mobility' ? 'mobility' : 'strength') === kind
    return sameKind ? { ...t, position: pos, updatedAt: new Date().toISOString() } : t
  })
  write(K_TEMPLATES, sortTemplates(next))
  return sortTemplates(next)
}

export function deleteTemplate(id: string): WorkoutTemplate[] {
  const next = getTemplates().filter((x) => x.id !== id)
  write(K_TEMPLATES, next)
  return next
}

// ── Template cloud sync (mirrors the pattern in lib/habits.ts) ────────────────

interface TemplateRow {
  id: string
  name: string
  kind: string | null
  color: string | null
  position: number | null
  exercises: TemplateExercise[]
  note: string | null
  warmup_id: string | null
  warmup_progressive: boolean | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

const fromTemplateRow = (r: TemplateRow): WorkoutTemplate => ({
  id: r.id,
  name: r.name,
  kind: r.kind === 'mobility' ? 'mobility' : 'strength',
  color: r.color ?? undefined,
  position: r.position ?? undefined,
  exercises: Array.isArray(r.exercises) ? r.exercises : [],
  note: r.note ?? undefined,
  warmupId: r.warmup_id ?? null,
  warmupProgressive: r.warmup_progressive === true,
  archivedAt: r.archived_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

/** Fetch templates from the cloud and refresh the local cache. Local-only
 *  templates (created offline or before sync existed) are pushed up instead
 *  of being dropped. Falls back to the local cache when offline. */
export async function pullTemplates(userId: string): Promise<WorkoutTemplate[]> {
  if (!supabase) return getTemplates()
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.warn('[workouts] pull templates:', error.message)
    return getTemplates()
  }
  const cloud = (data ?? []).map((r) => fromTemplateRow(r as TemplateRow))
  const cloudIds = new Set(cloud.map((t) => t.id))
  const localOnly = getTemplates().filter((t) => !cloudIds.has(t.id))
  for (const t of localOnly) syncTemplateCloud(userId, t)
  const next = sortTemplates([...cloud, ...localOnly])
  write(K_TEMPLATES, next)
  return next
}

export function syncTemplateCloud(userId: string, t: WorkoutTemplate): void {
  supabase
    ?.from('workout_templates')
    .upsert({
      id: t.id,
      user_id: userId,
      name: t.name,
      kind: t.kind ?? 'strength',
      color: t.color ?? null,
      position: t.position ?? null,
      exercises: t.exercises,
      note: t.note ?? null,
      warmup_id: t.warmupId ?? null,
      warmup_progressive: t.warmupProgressive === true,
      archived_at: t.archivedAt ?? null,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    })
    .then(({ error }) => { if (error) console.warn('[workouts] template sync:', error.message) })
}

export function deleteTemplateCloud(userId: string, id: string): void {
  supabase
    ?.from('workout_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[workouts] template delete:', error.message) })
}

// ── History (completed workouts) ───────────────────────────────────────────────
export function getWorkouts(): Workout[] {
  const arr = read<Workout[]>(K_HISTORY, [])
  if (!Array.isArray(arr)) return []
  // Newest first
  return [...arr].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
}

export function saveWorkout(w: Workout): Workout[] {
  const next = getWorkouts().filter((x) => x.id !== w.id)
  next.push({ ...w, completed: true })
  write(K_HISTORY, next)
  return getWorkouts()
}

export function deleteWorkout(id: string): Workout[] {
  const next = getWorkouts().filter((x) => x.id !== id)
  write(K_HISTORY, next)
  return next
}

// ── History cloud sync ─────────────────────────────────────────────────────────

interface WorkoutRow {
  id: string
  date: string
  name: string
  template_id: string | null
  color: string | null
  exercises: LoggedExercise[]
  completed: boolean
  warmup_done: boolean | null
  location_id: string | null
  assessments: Assessment[] | null
  created_at: string
  updated_at: string
}

const fromWorkoutRow = (r: WorkoutRow): Workout => ({
  id: r.id,
  date: r.date,
  name: r.name,
  templateId: r.template_id ?? undefined,
  color: r.color ?? undefined,
  exercises: Array.isArray(r.exercises) ? r.exercises : [],
  completed: r.completed,
  warmupDone: r.warmup_done ?? undefined,
  locationId: r.location_id ?? undefined,
  assessments: Array.isArray(r.assessments) ? r.assessments : undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

/** Fetch workout history from the cloud and refresh the local cache.
 *  Local-only workouts (logged offline or before sync existed) are pushed up
 *  instead of being dropped. Falls back to the local cache when offline. */
export async function pullWorkouts(userId: string): Promise<Workout[]> {
  if (!supabase) return getWorkouts()
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.warn('[workouts] pull history:', error.message)
    return getWorkouts()
  }
  const cloud = (data ?? []).map((r) => fromWorkoutRow(r as WorkoutRow))
  const cloudIds = new Set(cloud.map((w) => w.id))
  const localOnly = getWorkouts().filter((w) => !cloudIds.has(w.id))
  for (const w of localOnly) syncWorkoutCloud(userId, w)
  write(K_HISTORY, [...cloud, ...localOnly])
  return getWorkouts()
}

export function syncWorkoutCloud(userId: string, w: Workout): void {
  supabase
    ?.from('workouts')
    .upsert({
      id: w.id,
      user_id: userId,
      date: w.date,
      name: w.name,
      template_id: w.templateId ?? null,
      color: w.color ?? null,
      exercises: w.exercises,
      completed: w.completed,
      warmup_done: w.warmupDone ?? false,
      location_id: w.locationId ?? null,
      assessments: w.assessments ?? [],
      created_at: w.createdAt,
      updated_at: w.updatedAt,
    })
    .then(({ error }) => { if (error) console.warn('[workouts] history sync:', error.message) })
}

export function deleteWorkoutCloud(userId: string, id: string): void {
  supabase
    ?.from('workouts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[workouts] history delete:', error.message) })
}

// ── In-progress draft (autosaved) ──────────────────────────────────────────────
export function getDraft(): Workout | null {
  return read<Workout | null>(K_DRAFT, null)
}

export function saveDraft(w: Workout): void {
  write(K_DRAFT, w)
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(K_DRAFT)
  } catch {
    // ignore
  }
}

// ── Suggestions ────────────────────────────────────────────────────────────────
/** Most recent logged version of an exercise (by name), for pre-filling sets
 *  when the user repeats a workout. Case-insensitive match. */
export function lastEntryForExercise(name: string, excludeWorkoutId?: string): LoggedExercise | null {
  const target = name.trim().toLowerCase()
  for (const w of getWorkouts()) {
    if (excludeWorkoutId && w.id === excludeWorkoutId) continue
    const ex = w.exercises.find((e) => e.name.trim().toLowerCase() === target)
    if (ex && ex.sets.length > 0) return ex
  }
  return null
}

// ── Builders ───────────────────────────────────────────────────────────────────
/** Build a blank set seeded from a template exercise's defaults. */
function seedSet(te?: TemplateExercise): SetEntry {
  const s: SetEntry = {}
  if (te?.repRange) s.reps = te.repRange.min
  if (te?.defaultWeight != null) s.weight = te.defaultWeight
  if (te?.defaultDuration != null) s.duration = te.defaultDuration
  return s
}

/** Create a fresh draft workout, optionally from a template. Exercises are
 *  pre-seeded from the user's last logged session for that exercise when
 *  available, otherwise from the template defaults. */
export function newWorkout(todayISO: string, template?: WorkoutTemplate): Workout {
  const now = new Date().toISOString()
  const exercises: LoggedExercise[] = (template?.exercises ?? []).map((te) => {
    // Interval (mobility) exercises are clocked, not counted — their sets are
    // plain done-trackers seeded straight from the template's set count.
    if (te.interval) {
      return {
        id: uid(),
        name: te.name,
        sets: Array.from({ length: Math.max(1, te.defaultSets) }, () => ({})),
        interval: { ...te.interval },
      }
    }
    const last = lastEntryForExercise(te.name)
    const sets =
      last && last.sets.length > 0
        ? copySetsForNewSession(last.sets)
        : Array.from({ length: Math.max(1, te.defaultSets) }, () => seedSet(te))
    return { id: uid(), name: te.name, sets }
  })
  return {
    id: uid(),
    date: todayISO,
    name: template?.name ?? 'Treeni',
    templateId: template?.id,
    color: template?.color,
    exercises,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }
}
