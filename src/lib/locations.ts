// Where you train, as a capability profile.
//
// This is the condition gate: it decides which movements are possible at all,
// before any question about how the body feels. A location is not a place so
// much as a set of five yes/no facts, because those five are what actually
// change the session.

import { supabase } from './supabase'
import { uid } from './workouts'

const K_LOCATIONS = 'mimir.workouts.locations:v1'
const K_LAST = 'mimir.workouts.lastLocation:v1'
/** Ids this device has seen in the cloud, so a later absence reads as a
 *  deletion rather than as something created offline. */
const K_SEEN = 'mimir.workouts.locationsSeen:v1'

export type Capability =
  | 'externalLoad'
  | 'muscleUpBar'
  | 'plyoBox'
  | 'anchorAndBand'
  | 'parallettes'
  | 'trapBar'

export const CAPABILITIES: Capability[] = [
  'externalLoad',
  'muscleUpBar',
  'plyoBox',
  'anchorAndBand',
  'parallettes',
  'trapBar',
]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  externalLoad: 'Lisäkuorma (kuulat / reppu / levyt)',
  muscleUpBar: 'Muscle up onnistuu',
  plyoBox: 'Hyppylaatikko',
  anchorAndBand: 'Ankkuri ja kuminauha',
  parallettes: 'Paraletit',
  trapBar: 'Trap bar',
}

export interface TrainingLocation {
  id: string
  name: string
  hasExternalLoad: boolean
  canMuscleUp: boolean
  hasPlyoBox: boolean
  hasAnchorAndBand: boolean
  hasParallettes: boolean
  hasTrapBar: boolean
  position?: number
  createdAt?: string
  updatedAt?: string
}

/** Which boolean on a location answers which capability. Exported so the
 *  new-location form is generated from the same list the resolver reads: adding
 *  a capability then shows up as a toggle without touching the UI. */
export const FIELD_OF: Record<Capability, keyof TrainingLocation> = {
  externalLoad: 'hasExternalLoad',
  muscleUpBar: 'canMuscleUp',
  plyoBox: 'hasPlyoBox',
  anchorAndBand: 'hasAnchorAndBand',
  parallettes: 'hasParallettes',
  trapBar: 'hasTrapBar',
}

export function locationHas(loc: TrainingLocation | null, cap: Capability): boolean {
  if (!loc) return true // unknown location assumes nothing is missing
  return loc[FIELD_OF[cap]] === true
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

/** Locations from the local cache. The database is the source of truth — see
 *  pullLocations — and there is deliberately no built-in seed: content lives in
 *  the database, not in a constant in the client. An empty list simply means
 *  "not synced yet", and the daily check offers to create one. */
export function getLocations(): TrainingLocation[] {
  const list = read<TrainingLocation[]>(K_LOCATIONS, [])
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
}

export function saveLocation(loc: TrainingLocation): TrainingLocation[] {
  const next = [...getLocations().filter((l) => l.id !== loc.id), loc]
  write(K_LOCATIONS, next)
  return next
}

export function deleteLocation(id: string): TrainingLocation[] {
  const next = getLocations().filter((l) => l.id !== id)
  write(K_LOCATIONS, next)
  return next
}

export function newLocation(name = ''): TrainingLocation {
  const now = new Date().toISOString()
  return {
    id: uid(),
    name,
    hasExternalLoad: false,
    canMuscleUp: false,
    hasPlyoBox: false,
    hasAnchorAndBand: false,
    hasParallettes: false,
    hasTrapBar: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** The place used last, so the common case is one tap on a pre-selected chip. */
export function getLastLocationId(): string | null {
  return read<string | null>(K_LAST, null)
}

export function setLastLocationId(id: string): void {
  write(K_LAST, id)
}

/** Ids known to have come from the cloud. Null on the very first pull after
 *  this bookkeeping was added — see the note in pullLocations. */
function getSeenIds(): Set<string> | null {
  try {
    const raw = localStorage.getItem(K_SEEN)
    if (raw === null) return null
    const list = JSON.parse(raw)
    return new Set(Array.isArray(list) ? (list as string[]) : [])
  } catch {
    return new Set()
  }
}

export function locationById(id: string | undefined | null): TrainingLocation | null {
  if (!id) return null
  return getLocations().find((l) => l.id === id) ?? null
}

// ── Cloud sync ─────────────────────────────────────────────────────────────
// Same shape as blocks and templates: the table is authoritative, localStorage
// is the offline cache, and anything created offline is pushed up rather than
// dropped.

interface LocationRow {
  id: string
  name: string
  has_external_load: boolean
  can_muscle_up: boolean
  has_plyo_box: boolean
  has_anchor_and_band: boolean
  has_parallettes: boolean
  has_trap_bar: boolean
  position: number | null
  created_at: string
  updated_at: string
}

const fromRow = (r: LocationRow): TrainingLocation => ({
  id: r.id,
  name: r.name,
  hasExternalLoad: r.has_external_load,
  canMuscleUp: r.can_muscle_up,
  hasPlyoBox: r.has_plyo_box,
  hasAnchorAndBand: r.has_anchor_and_band,
  hasParallettes: r.has_parallettes,
  hasTrapBar: r.has_trap_bar,
  position: r.position ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export async function pullLocations(userId: string): Promise<TrainingLocation[]> {
  if (!supabase) return getLocations()
  const { data, error } = await supabase.from('workout_locations').select('*').eq('user_id', userId)
  if (error) {
    console.warn('[locations] pull:', error.message)
    return getLocations()
  }
  const cloud = (data ?? []).map((r) => fromRow(r as LocationRow))
  const cloudIds = new Set(cloud.map((l) => l.id))
  const local = getLocations()

  // A local row missing from the cloud is one of two opposite things, and
  // getting them the wrong way round is why deleting a location used to be
  // impossible: whatever was removed server-side got helpfully re-uploaded on
  // the next pull. If we have seen the id come down from the cloud before, its
  // absence now means it was deleted — drop it. If we have never seen it, it
  // was created on this device while offline — push it up.
  //
  // On the first pull after this bookkeeping existed there is no record either
  // way. Locations have synced to the cloud since the day they were added, so
  // anything already cached here arrived from there: treat the whole local set
  // as seen, which lets a server-side deletion take effect immediately.
  //
  // Except when the cloud came back empty. "No rows" and "could not see your
  // rows" are indistinguishable here, and guessing wrong once would delete
  // every location the device had. With no record to go on, the safe reading of
  // an empty response is that there is nothing to reconcile against — so the
  // local set is pushed up rather than thrown away.
  const recorded = getSeenIds()
  const seen = recorded ?? (cloud.length > 0 ? new Set(local.map((l) => l.id)) : new Set<string>())

  const localOnly = local.filter((l) => !cloudIds.has(l.id))
  const createdOffline = localOnly.filter((l) => !seen.has(l.id))
  for (const l of createdOffline) syncLocationCloud(userId, l)

  const next = [...cloud, ...createdOffline].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
  write(K_LOCATIONS, next)
  if (cloud.length > 0) write(K_SEEN, [...cloudIds])
  return next
}

export function syncLocationCloud(userId: string, l: TrainingLocation): void {
  supabase
    ?.from('workout_locations')
    .upsert({
      id: l.id,
      user_id: userId,
      name: l.name,
      has_external_load: l.hasExternalLoad,
      can_muscle_up: l.canMuscleUp,
      has_plyo_box: l.hasPlyoBox,
      has_anchor_and_band: l.hasAnchorAndBand,
      has_parallettes: l.hasParallettes,
      has_trap_bar: l.hasTrapBar,
      position: l.position ?? null,
      created_at: l.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .then(({ error }) => { if (error) console.warn('[locations] sync:', error.message) })
}

export function deleteLocationCloud(userId: string, id: string): void {
  supabase
    ?.from('workout_locations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[locations] delete:', error.message) })
}
