// Per-user interface preferences that aren't part of any one tool's data —
// currently just the order of the home launcher's tiles. Supabase is the source
// of truth (ui_prefs), localStorage only caches it so the first paint isn't
// blank and the app still works offline.
import { supabase } from './supabase'

const K_PREFS = 'friday.uiPrefs:v1'

export interface UiPrefs {
  /** Tool labels in the order they should appear on the home screen. Labels the
   *  list doesn't mention keep their built-in position at the end, so shipping a
   *  new tool never hides it behind a stale saved order. */
  homeToolOrder?: string[]
}

export function getPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(K_PREFS)
    if (!raw) return {}
    const p = JSON.parse(raw) as UiPrefs
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

export function savePrefsLocal(p: UiPrefs): UiPrefs {
  try {
    localStorage.setItem(K_PREFS, JSON.stringify(p))
  } catch {
    // best-effort
  }
  return p
}

export async function pullPrefs(userId: string): Promise<UiPrefs> {
  if (!supabase) return getPrefs()
  const { data, error } = await supabase
    .from('ui_prefs')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[uiPrefs] pull:', error.message)
    return getPrefs()
  }
  // No cloud row yet: push whatever this device has so it isn't lost.
  if (!data) {
    const local = getPrefs()
    if (Object.keys(local).length > 0) syncPrefsCloud(userId, local)
    return local
  }
  return savePrefsLocal((data.data ?? {}) as UiPrefs)
}

export function syncPrefsCloud(userId: string, p: UiPrefs): void {
  supabase
    ?.from('ui_prefs')
    .upsert({ user_id: userId, data: p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.warn('[uiPrefs] sync:', error.message) })
}

/** Applies a saved order to a list keyed by `key`. Unknown keys keep their
 *  original relative order and land after everything the order names. */
export function applyOrder<T>(items: T[], key: (t: T) => string, order?: string[]): T[] {
  if (!order || order.length === 0) return items
  const rank = new Map(order.map((k, i) => [k, i]))
  return [...items].sort((a, b) => {
    const ra = rank.get(key(a)) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(key(b)) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return items.indexOf(a) - items.indexOf(b)
  })
}
