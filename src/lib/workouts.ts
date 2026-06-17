// Workout logging tool — device-local persistence (no cloud sync).
// Three stores: reusable templates, completed-workout history, and a single
// in-progress draft that is autosaved continuously until the workout is saved.

const K_TEMPLATES = 'mimir.workouts.templates:v1'
const K_HISTORY   = 'mimir.workouts.history:v1'
const K_DRAFT     = 'mimir.workouts.draft:v1'

// ── Types ────────────────────────────────────────────────────────────────────
export interface RepRange {
  min: number
  max: number
}

/** One exercise as defined in a template (the plan / defaults). */
export interface TemplateExercise {
  id: string
  name: string
  defaultSets: number
  repRange?: RepRange
  defaultWeight?: number    // kg
  defaultDuration?: number  // seconds
}

export interface WorkoutTemplate {
  id: string
  name: string
  exercises: TemplateExercise[]
  createdAt: string
  updatedAt: string
}

/** A single logged set. Every field is optional — a set may track any
 *  combination of reps, weight, and duration. */
export interface SetEntry {
  reps?: number
  weight?: number    // kg
  duration?: number  // seconds
}

export interface LoggedExercise {
  id: string
  name: string
  sets: SetEntry[]
}

export interface Workout {
  id: string
  date: string            // ISO yyyy-mm-dd
  name: string
  templateId?: string
  exercises: LoggedExercise[]
  completed: boolean
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
export function getTemplates(): WorkoutTemplate[] {
  const arr = read<WorkoutTemplate[]>(K_TEMPLATES, [])
  return Array.isArray(arr) ? arr : []
}

export function saveTemplate(t: WorkoutTemplate): WorkoutTemplate[] {
  const next = getTemplates().filter((x) => x.id !== t.id)
  next.push(t)
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  write(K_TEMPLATES, next)
  return next
}

export function deleteTemplate(id: string): WorkoutTemplate[] {
  const next = getTemplates().filter((x) => x.id !== id)
  write(K_TEMPLATES, next)
  return next
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
    const last = lastEntryForExercise(te.name)
    const sets =
      last && last.sets.length > 0
        ? last.sets.map((s) => ({ ...s }))
        : Array.from({ length: Math.max(1, te.defaultSets) }, () => seedSet(te))
    return { id: uid(), name: te.name, sets }
  })
  return {
    id: uid(),
    date: todayISO,
    name: template?.name ?? 'Treeni',
    templateId: template?.id,
    exercises,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }
}
