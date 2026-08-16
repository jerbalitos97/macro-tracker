// Where you train, as a capability profile.
//
// This is the condition gate: it decides which movements are possible at all,
// before any question about how the body feels. A location is not a place so
// much as a set of five yes/no facts, because those five are what actually
// change the session.

import { uid } from './workouts'

const K_LOCATIONS = 'mimir.workouts.locations:v1'
const K_LAST = 'mimir.workouts.lastLocation:v1'

export type Capability =
  | 'externalLoad'
  | 'muscleUpBar'
  | 'plyoBox'
  | 'anchorAndBand'
  | 'parallettes'

export const CAPABILITIES: Capability[] = [
  'externalLoad',
  'muscleUpBar',
  'plyoBox',
  'anchorAndBand',
  'parallettes',
]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  externalLoad: 'Lisäkuorma (kuulat / reppu / levyt)',
  muscleUpBar: 'Muscle up onnistuu',
  plyoBox: 'Hyppylaatikko',
  anchorAndBand: 'Ankkuri ja kuminauha',
  parallettes: 'Paraletit',
}

export interface TrainingLocation {
  id: string
  name: string
  hasExternalLoad: boolean
  canMuscleUp: boolean
  hasPlyoBox: boolean
  hasAnchorAndBand: boolean
  hasParallettes: boolean
}

const FIELD_OF: Record<Capability, keyof TrainingLocation> = {
  externalLoad: 'hasExternalLoad',
  muscleUpBar: 'canMuscleUp',
  plyoBox: 'hasPlyoBox',
  anchorAndBand: 'hasAnchorAndBand',
  parallettes: 'hasParallettes',
}

export function locationHas(loc: TrainingLocation | null, cap: Capability): boolean {
  if (!loc) return true // unknown location assumes nothing is missing
  return loc[FIELD_OF[cap]] === true
}

/** The two places that exist on day one. Editable like any other. */
export function seedLocations(): TrainingLocation[] {
  return [
    {
      id: 'loc-koti',
      name: 'Koti',
      hasExternalLoad: true,   // kahvakuulat / reppu
      canMuscleUp: false,
      hasPlyoBox: true,
      hasAnchorAndBand: true,
      hasParallettes: true,
    },
    {
      id: 'loc-sali',
      name: 'Mikon sali',
      hasExternalLoad: true,
      canMuscleUp: true,
      hasPlyoBox: true,
      hasAnchorAndBand: true,
      hasParallettes: true,
    },
  ]
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

export function getLocations(): TrainingLocation[] {
  const list = read<TrainingLocation[]>(K_LOCATIONS, [])
  if (!Array.isArray(list) || list.length === 0) {
    const seeded = seedLocations()
    write(K_LOCATIONS, seeded)
    return seeded
  }
  return list
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
  return {
    id: uid(),
    name,
    hasExternalLoad: false,
    canMuscleUp: false,
    hasPlyoBox: false,
    hasAnchorAndBand: false,
    hasParallettes: false,
  }
}

/** The place used last, so the common case is one tap on a pre-selected chip. */
export function getLastLocationId(): string | null {
  return read<string | null>(K_LAST, null)
}

export function setLastLocationId(id: string): void {
  write(K_LAST, id)
}

export function locationById(id: string | undefined | null): TrainingLocation | null {
  if (!id) return null
  return getLocations().find((l) => l.id === id) ?? null
}
