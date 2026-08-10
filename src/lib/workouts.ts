// Workout logging tool. Templates sync to Supabase (workout_templates table)
// with localStorage as the offline cache; completed-workout history and the
// autosaved in-progress draft remain device-local.
import { supabase } from './supabase'

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

// ── Template cloud sync (mirrors the pattern in lib/habits.ts) ────────────────

interface TemplateRow {
  id: string
  name: string
  exercises: TemplateExercise[]
  created_at: string
  updated_at: string
}

const fromTemplateRow = (r: TemplateRow): WorkoutTemplate => ({
  id: r.id,
  name: r.name,
  exercises: Array.isArray(r.exercises) ? r.exercises : [],
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
  const next = [...cloud, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
      exercises: t.exercises,
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
