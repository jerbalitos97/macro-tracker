// Grocery tool data layer — Supabase-backed with realtime sync so multiple
// people picking the same list see each other's changes near-instantly.
// A list is identified by an unguessable uuid that doubles as the share token.
import { supabase } from './supabase'
import { classify } from './groceryCategories'
import type { CategoryKey, StoreKey } from './groceryCategories'

export type Unit = 'pcs' | 'g' | 'l'

export const UNIT_LABEL: Record<Unit, string> = { pcs: 'kpl', g: 'g', l: 'l' }

export interface GroceryItem {
  id: string
  list_id: string
  name: string
  amount: number | null
  unit: Unit | null
  category: CategoryKey
  done: boolean
  taken_by: string | null
  created_at: string
}

export interface GroceryList {
  id: string
  name: string
  store: StoreKey
  created_at: string
}

const K_LIST = 'friday.grocery.listId'
const K_NAME = 'friday.grocery.name'

// ── Participant name (per device) ──────────────────────────────────────────
export function getName(): string {
  try { return localStorage.getItem(K_NAME) ?? '' } catch { return '' }
}
export function setName(name: string): void {
  try { localStorage.setItem(K_NAME, name.trim()) } catch { /* ignore */ }
}

// ── List bootstrap ──────────────────────────────────────────────────────────
function rememberListId(id: string) {
  try { localStorage.setItem(K_LIST, id) } catch { /* ignore */ }
}
function savedListId(): string | null {
  try { return localStorage.getItem(K_LIST) } catch { return null }
}

/** Owner: load the device's active list, or create one. */
export async function getOrCreateList(): Promise<GroceryList | null> {
  if (!supabase) return null
  const existing = savedListId()
  if (existing) {
    const { data } = await supabase.from('grocery_lists').select('*').eq('id', existing).maybeSingle()
    if (data) return data as GroceryList
  }
  const { data, error } = await supabase
    .from('grocery_lists')
    .insert({ name: 'Ostoslista', store: 's' })
    .select()
    .single()
  if (error || !data) return null
  rememberListId(data.id)
  return data as GroceryList
}

/** Guest / shared: load a specific list by id (the share token). */
export async function getListById(id: string): Promise<GroceryList | null> {
  if (!supabase) return null
  const { data } = await supabase.from('grocery_lists').select('*').eq('id', id).maybeSingle()
  if (data) rememberListId(data.id)
  return (data as GroceryList) ?? null
}

export async function getItems(listId: string): Promise<GroceryItem[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
  return (data as GroceryItem[]) ?? []
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function addItem(
  listId: string,
  input: { name: string; amount: number | null; unit: Unit | null },
): Promise<void> {
  if (!supabase) return
  await supabase.from('grocery_items').insert({
    list_id: listId,
    name: input.name.trim(),
    amount: input.amount,
    unit: input.unit,
    category: classify(input.name),
  })
}

export async function setDone(item: GroceryItem, done: boolean, byName: string): Promise<void> {
  if (!supabase) return
  await supabase
    .from('grocery_items')
    .update({ done, taken_by: done ? byName : null, updated_at: new Date().toISOString() })
    .eq('id', item.id)
}

export async function setCategory(id: string, category: CategoryKey): Promise<void> {
  if (!supabase) return
  await supabase.from('grocery_items').update({ category }).eq('id', id)
}

export async function deleteItem(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('grocery_items').delete().eq('id', id)
}

export async function clearDone(listId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('grocery_items').delete().eq('list_id', listId).eq('done', true)
}

export async function setStore(listId: string, store: StoreKey): Promise<void> {
  if (!supabase) return
  await supabase.from('grocery_lists').update({ store }).eq('id', listId)
}

// ── Realtime ──────────────────────────────────────────────────────────────────
/** Subscribe to all changes for a list. `onChange` fires on any item or list
 *  change (callers re-fetch). Returns an unsubscribe function. */
export function subscribe(listId: string, onChange: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel(`grocery:${listId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${listId}` },
      onChange)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'grocery_lists', filter: `id=eq.${listId}` },
      onChange)
    .subscribe()
  return () => { client.removeChannel(channel) }
}

/** The shareable link for a list. */
export function shareLink(listId: string): string {
  return `${location.origin}/?g=${listId}`
}

/** Read the shared-list id from the URL (?g=…), if present. */
export function sharedListIdFromUrl(): string | null {
  try {
    return new URLSearchParams(location.search).get('g')
  } catch {
    return null
  }
}
