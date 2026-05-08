import { supabase } from './supabase'
import type {
  AppData,
  Meal,
  WeightEntry,
  TrainingBurn,
  SpecialEvent,
  ExtraWorkout,
  Settings,
} from '../types'

// ── Individual upserts (called on every mutation) ─────────────

export function syncSettings(userId: string, s: Settings) {
  supabase
    ?.from('settings')
    .upsert({ user_id: userId, data: s, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.warn('[sync] settings:', error.message) })
}

export function syncMeal(userId: string, m: Meal) {
  supabase
    ?.from('meals')
    .upsert({ id: m.id, user_id: userId, date: m.date, kcal: m.kcal, protein: m.protein })
    .then(({ error }) => { if (error) console.warn('[sync] meal:', error.message) })
}

export function deleteMeal(userId: string, id: number) {
  supabase
    ?.from('meals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[sync] deleteMeal:', error.message) })
}

export function syncWeight(userId: string, w: WeightEntry) {
  supabase
    ?.from('weight_entries')
    .upsert({ id: w.id, user_id: userId, date: w.date, kg: w.kg, exclude_from_trend: w.excludeFromTrend })
    .then(({ error }) => { if (error) console.warn('[sync] weight:', error.message) })
}

export function deleteWeight(userId: string, id: number) {
  supabase
    ?.from('weight_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[sync] deleteWeight:', error.message) })
}

export function syncBurn(userId: string, b: TrainingBurn) {
  supabase
    ?.from('training_burns')
    .upsert({ id: b.id, user_id: userId, date: b.date, kcal: b.kcal, note: b.note })
    .then(({ error }) => { if (error) console.warn('[sync] burn:', error.message) })
}

export function deleteBurn(userId: string, id: number) {
  supabase
    ?.from('training_burns')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[sync] deleteBurn:', error.message) })
}

export function syncEvent(userId: string, e: SpecialEvent) {
  supabase
    ?.from('special_events')
    .upsert({
      id: e.id, user_id: userId, date: e.date, name: e.name,
      excess_kcal: e.excessKcal, buffer_days: e.bufferDays, buffer_direction: e.bufferDirection,
    })
    .then(({ error }) => { if (error) console.warn('[sync] event:', error.message) })
}

export function deleteEvent(userId: string, id: number) {
  supabase
    ?.from('special_events')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[sync] deleteEvent:', error.message) })
}

export function syncExtra(userId: string, x: ExtraWorkout) {
  supabase
    ?.from('extra_workouts')
    .upsert({ id: x.id, user_id: userId, date: x.date, kcal: x.kcal, note: x.note })
    .then(({ error }) => { if (error) console.warn('[sync] extra:', error.message) })
}

export function deleteExtra(userId: string, id: number) {
  supabase
    ?.from('extra_workouts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[sync] deleteExtra:', error.message) })
}

// ── Bulk push (migration: local → cloud) ──────────────────────

export async function pushAllData(userId: string, data: AppData): Promise<'ok' | 'error'> {
  if (!supabase) return 'error'
  try {
    const ops: PromiseLike<unknown>[] = [
      supabase.from('settings').upsert(
        { user_id: userId, data: data.settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      ),
    ]
    if (data.meals.length)
      ops.push(supabase.from('meals').upsert(data.meals.map((m) => ({ ...m, user_id: userId }))))
    if (data.weights.length)
      ops.push(supabase.from('weight_entries').upsert(
        data.weights.map((w) => ({
          id: w.id, user_id: userId, date: w.date, kg: w.kg, exclude_from_trend: w.excludeFromTrend,
        })),
      ))
    if (data.burns.length)
      ops.push(supabase.from('training_burns').upsert(data.burns.map((b) => ({ ...b, user_id: userId }))))
    if (data.events.length)
      ops.push(supabase.from('special_events').upsert(
        data.events.map((e) => ({
          id: e.id, user_id: userId, date: e.date, name: e.name,
          excess_kcal: e.excessKcal, buffer_days: e.bufferDays, buffer_direction: e.bufferDirection,
        })),
      ))
    if (data.extras.length)
      ops.push(supabase.from('extra_workouts').upsert(data.extras.map((x) => ({ ...x, user_id: userId }))))

    await Promise.all(ops)
    return 'ok'
  } catch (err) {
    console.error('[sync] pushAllData failed:', err)
    return 'error'
  }
}

// ── Pull all (on login) ────────────────────────────────────────

export async function pullAllData(userId: string): Promise<AppData | null> {
  if (!supabase) return null
  try {
    const [settingsRes, mealsRes, weightsRes, burnsRes, eventsRes, extrasRes] = await Promise.all([
      supabase.from('settings').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('meals').select('*').eq('user_id', userId),
      supabase.from('weight_entries').select('*').eq('user_id', userId),
      supabase.from('training_burns').select('*').eq('user_id', userId),
      supabase.from('special_events').select('*').eq('user_id', userId),
      supabase.from('extra_workouts').select('*').eq('user_id', userId),
    ])

    // If settings row doesn't exist yet, signal "empty cloud"
    if (!settingsRes.data) return null

    const weights: WeightEntry[] = (weightsRes.data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      kg: Number(r.kg),
      excludeFromTrend: r.exclude_from_trend,
    }))

    const events: SpecialEvent[] = (eventsRes.data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      name: r.name,
      excessKcal: Number(r.excess_kcal),
      bufferDays: r.buffer_days,
      bufferDirection: r.buffer_direction,
    }))

    return {
      settings: settingsRes.data.data as Settings,
      meals: (mealsRes.data ?? []).map((r) => ({ id: r.id, date: r.date, kcal: Number(r.kcal), protein: Number(r.protein) })),
      weights,
      burns: (burnsRes.data ?? []).map((r) => ({ id: r.id, date: r.date, kcal: Number(r.kcal), note: r.note })),
      events,
      extras: (extrasRes.data ?? []).map((r) => ({ id: r.id, date: r.date, kcal: Number(r.kcal), note: r.note })),
    }
  } catch (err) {
    console.error('[sync] pullAllData failed:', err)
    return null
  }
}
