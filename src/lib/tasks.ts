import { supabase } from './supabase'

// Tehtävät — kertaluontoisia päivättyjä rivejä.
//
// Ei sama asia kuin habit. Habitilla on `task_days` ja `goal_period`, eli se
// toistuu; tehtävä kuitataan kerran ja voidaan siirtää toiselle päivälle. Ne
// yhteen pakottava malli vääristäisi kumpaakin, ja habitit ovat Fridayn kypsintä
// koodia — niihin ei kosketa.
//
// Pilvi-only, kuten habitit. Ei localStorage-välimuistia: nämä rivit ovat pieniä
// ja niitä luetaan päivä kerrallaan, eikä offline-kirjaus ole tälle työkalulle
// se ongelma jonka vuoksi ruokakirjaus on paikallinen.

export interface Task {
  id: string
  title: string
  scheduledDate: string
  done: boolean
  doneAt: string | null
  createdAt: string
}

interface TaskRow {
  id: string
  title: string
  scheduled_date: string
  done: boolean
  done_at: string | null
  created_at: string
}

const fromRow = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  scheduledDate: r.scheduled_date,
  done: r.done,
  doneAt: r.done_at,
  createdAt: r.created_at,
})

const COLS = 'id, title, scheduled_date, done, done_at, created_at'

export async function listTasksForDate(userId: string, dateISO: string): Promise<Task[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('tasks')
    .select(COLS)
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .order('done', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as TaskRow))
}

export async function listTasksInRange(
  userId: string,
  fromISO: string,
  toISO: string
): Promise<Task[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('tasks')
    .select(COLS)
    .eq('user_id', userId)
    .gte('scheduled_date', fromISO)
    .lte('scheduled_date', toISO)
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as TaskRow))
}

/** Kaikki tehtävät vientiä varten. */
export async function listAllTasks(userId: string): Promise<Task[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('tasks')
    .select(COLS)
    .eq('user_id', userId)
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as TaskRow))
}

export async function createTask(
  userId: string,
  title: string,
  scheduledDate: string
): Promise<Task | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, title, scheduled_date: scheduledDate })
    .select(COLS)
    .single()
  if (error) throw error
  return fromRow(data as TaskRow)
}

export async function setTaskDone(userId: string, id: string, done: boolean): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('tasks')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function rescheduleTask(userId: string, id: string, dateISO: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('tasks')
    .update({ scheduled_date: dateISO })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}
