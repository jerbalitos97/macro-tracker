// Warm-up packages.
//
// A warm-up is a fixed routine, not training volume. It used to live as
// numbered exercises in the template ("Ranne + kyynärvarsi prep", "Cuban
// rotation"), which made it look like work to log set by set and quietly
// inflated every session's slot count. It is one package instead: attached to
// a template, ticked off as a whole, and shared between the sessions that use
// the same prep — edit it once and every session that references it changes.
//
// Content lives in the database like every other template content. There is no
// seed constant here on purpose; an empty list means "not synced yet".

import { supabase } from './supabase'
import type { GateState } from './gates'

const K_WARMUPS = 'mimir.workouts.warmups:v1'

/** One movement in a warm-up. `dose` is free text rather than sets/reps because
 *  a warm-up is prescribed the way it is said out loud — "2 × 15, hidas
 *  eksentrinen", "kämmenet alas 30 s + ylös 30 s" — and forcing that into
 *  numeric fields would lose more than it standardises. Nothing counts it. */
export interface WarmupItem {
  id: string
  name: string
  dose: string
  note?: string
  /** Carries the once-a-week progressive dose in the template that is flagged
   *  for it; light and optional in the others. */
  progressive?: boolean
  /** Which body region's gate can escalate this item, and to what. The wrist
   *  items become a rehab dose on a treating day rather than a warm-up. */
  gateRegion?: 'knee' | 'back' | 'wrist'
  escalated?: { dose: string; note?: string }
}

export interface WarmupPackage {
  id: string
  name: string
  items: WarmupItem[]
  note?: string
  createdAt?: string
  updatedAt?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // best-effort
  }
}

export function getWarmups(): WarmupPackage[] {
  const list = read<WarmupPackage[]>(K_WARMUPS, [])
  return Array.isArray(list) ? list : []
}

export function warmupById(id: string | null | undefined): WarmupPackage | null {
  if (!id) return null
  return getWarmups().find((w) => w.id === id) ?? null
}

/** One item as it should read today: escalated when its region is being
 *  treated, and marked when this session carries the progressive dose. */
export interface ResolvedWarmupItem {
  id: string
  name: string
  dose: string
  note?: string
  escalated: boolean
  progressive: boolean
}

/** Apply the day's gates and this template's progressive flag to a package.
 *
 *  A treating wrist does not mean skipping wrist prep — it means doing more of
 *  it, slower and loaded, because that is the treatment. So the item is raised
 *  rather than dropped, which is the opposite of what the gate does to a
 *  loading slot, and the reason the escalation is spelled out per item instead
 *  of derived from the gate state. */
export function resolveWarmup(
  pkg: WarmupPackage | null,
  gates: Partial<Record<'knee' | 'back' | 'wrist', { state: GateState }>> | null,
  progressiveSession = false,
): ResolvedWarmupItem[] {
  if (!pkg) return []
  return pkg.items.map((it) => {
    const state = it.gateRegion ? gates?.[it.gateRegion]?.state : undefined
    const escalate = Boolean(
      it.escalated && (state === 'treat' || state === 'rest' || state === 'escalate'),
    )
    return {
      id: it.id,
      name: it.name,
      dose: escalate ? it.escalated!.dose : it.dose,
      note: escalate ? it.escalated!.note : it.note,
      escalated: escalate,
      progressive: Boolean(it.progressive) && progressiveSession,
    }
  })
}

// ── Cloud sync ─────────────────────────────────────────────────────────────

interface WarmupRow {
  id: string
  name: string
  items: unknown
  note: string | null
  created_at: string
  updated_at: string
}

const fromRow = (r: WarmupRow): WarmupPackage => ({
  id: r.id,
  name: r.name,
  items: Array.isArray(r.items) ? (r.items as WarmupItem[]) : [],
  note: r.note ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export async function pullWarmups(userId: string): Promise<WarmupPackage[]> {
  if (!supabase) return getWarmups()
  const { data, error } = await supabase.from('workout_warmups').select('*').eq('user_id', userId)
  if (error) {
    console.warn('[warmups] pull:', error.message)
    return getWarmups()
  }
  const cloud = (data ?? []).map((r) => fromRow(r as WarmupRow))
  const cloudIds = new Set(cloud.map((w) => w.id))
  const localOnly = getWarmups().filter((w) => !cloudIds.has(w.id))
  for (const w of localOnly) syncWarmupCloud(userId, w)
  const next = [...cloud, ...localOnly]
  write(K_WARMUPS, next)
  return next
}

export function syncWarmupCloud(userId: string, w: WarmupPackage): void {
  supabase
    ?.from('workout_warmups')
    .upsert({
      id: w.id,
      user_id: userId,
      name: w.name,
      items: w.items,
      note: w.note ?? null,
      created_at: w.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .then(({ error }) => { if (error) console.warn('[warmups] sync:', error.message) })
}

export function saveWarmup(w: WarmupPackage): WarmupPackage[] {
  const next = [...getWarmups().filter((x) => x.id !== w.id), w]
  write(K_WARMUPS, next)
  return next
}
