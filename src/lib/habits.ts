import { supabase } from './supabase'
import type { Habit, HabitEntry } from '../types'

// ── Row mappers ────────────────────────────────────────────────

interface HabitRow {
  id: number
  name: string
  description: string
  color: string
  habit_type: string
  goal_period: string
  goal_value: number
  goal_unit: string
  task_days: number[] | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

interface HabitEntryRow {
  id: number
  habit_id: number
  entry_date: string
  value: number
}

const fromHabitRow = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  habitType: 'build',
  goalPeriod: r.goal_period === 'week' ? 'week' : 'day',
  goalValue: r.goal_value,
  goalUnit: r.goal_unit === 'binary' ? 'binary' : 'count',
  taskDays: Array.isArray(r.task_days) ? r.task_days : [0, 1, 2, 3, 4, 5, 6],
  isArchived: r.is_archived,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const fromEntryRow = (r: HabitEntryRow): HabitEntry => ({
  id: r.id,
  habitId: r.habit_id,
  date: r.entry_date,
  value: r.value,
})

// ── Habits CRUD ────────────────────────────────────────────────

export async function listHabits(userId: string): Promise<Habit[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('[habits] list:', error.message)
    return []
  }
  return (data ?? []).map((r) => fromHabitRow(r as HabitRow))
}

export async function syncHabit(userId: string, h: Habit): Promise<string | null> {
  if (!supabase) return null
  const { error } = await supabase.from('habits').upsert({
    id: h.id,
    user_id: userId,
    name: h.name,
    description: h.description,
    color: h.color,
    habit_type: h.habitType,
    goal_period: h.goalPeriod,
    goal_value: h.goalValue,
    goal_unit: h.goalUnit,
    task_days: h.taskDays,
    is_archived: h.isArchived,
    updated_at: new Date().toISOString(),
  })
  if (error) console.warn('[habits] sync:', error.message)
  return error?.message ?? null
}

export async function archiveHabit(userId: string, id: number): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('habits')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) console.warn('[habits] archive:', error.message)
}

// ── Entries CRUD ───────────────────────────────────────────────

export async function listEntries(userId: string): Promise<HabitEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('habit_entries')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.warn('[habits] entries list:', error.message)
    return []
  }
  return (data ?? []).map((r) => fromEntryRow(r as HabitEntryRow))
}

export async function syncEntry(userId: string, e: HabitEntry): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('habit_entries')
    .upsert(
      {
        id: e.id,
        habit_id: e.habitId,
        user_id: userId,
        entry_date: e.date,
        value: e.value,
      },
      { onConflict: 'habit_id,entry_date' },
    )
  if (error) console.warn('[habits] entry sync:', error.message)
}

export async function deleteEntry(userId: string, id: number): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('habit_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) console.warn('[habits] entry delete:', error.message)
}
