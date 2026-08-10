// Editable warm-up routine. One routine per user, synced to Supabase
// (warmups table) with localStorage as the offline cache; the built-in
// program warm-up acts as the default until the user edits it.
import { supabase } from './supabase'

export interface WarmupMove {
  id: string
  name: string
  detail?: string
  dose: string
}

const K_WARMUP = 'mimir.workouts.warmup:v1'

export const DEFAULT_WARMUP: WarmupMove[] = [
  {
    id: 'w1',
    name: 'Rotaatiokombo',
    detail: 'polvillaan olkapääkierto + askelkyykky-kierrot + ATG-kyykkykierto — rintaranka, lonkat, takaketju, syvyys',
    dose: '2×/puoli ×3',
  },
  {
    id: 'w2',
    name: 'Rannerutiini',
    detail: 'quadruped rocks + sormet taakse painonsiirto + rystypito',
    dose: '60–90s',
  },
  {
    id: 'w3',
    name: 'Lapakierto',
    detail: 'scap push up + scap pull up / lapaveto',
    dose: '8 + 8',
  },
  {
    id: 'w4',
    name: 'Kuminauha ulko- + sisäkierto',
    dose: '10 + 10',
  },
  {
    id: 'w5',
    name: 'Ramppisarja',
    detail: 'päivän 1. liike: 2 kevennettyä sarjaa progressio alas (tuck ennen straddlea, pogo hopit ennen depth jumppeja)',
    dose: '2 sarjaa',
  },
]

export function getWarmup(): WarmupMove[] {
  try {
    const raw = localStorage.getItem(K_WARMUP)
    if (!raw) return DEFAULT_WARMUP
    const arr = JSON.parse(raw) as WarmupMove[]
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_WARMUP
  } catch {
    return DEFAULT_WARMUP
  }
}

export function saveWarmupLocal(moves: WarmupMove[]): void {
  try {
    localStorage.setItem(K_WARMUP, JSON.stringify(moves))
  } catch {
    // best-effort; ignore quota/availability errors
  }
}

/** Fetch the warm-up from the cloud and refresh the local cache. When the
 *  user has no cloud row yet, the local (default) routine is pushed up.
 *  Falls back to the local cache when offline. */
export async function pullWarmup(userId: string): Promise<WarmupMove[]> {
  if (!supabase) return getWarmup()
  const { data, error } = await supabase
    .from('warmups')
    .select('moves')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[warmup] pull:', error.message)
    return getWarmup()
  }
  if (!data) {
    const local = getWarmup()
    syncWarmupCloud(userId, local)
    return local
  }
  const moves = Array.isArray(data.moves) && data.moves.length > 0
    ? (data.moves as WarmupMove[])
    : DEFAULT_WARMUP
  saveWarmupLocal(moves)
  return moves
}

export function syncWarmupCloud(userId: string, moves: WarmupMove[]): void {
  supabase
    ?.from('warmups')
    .upsert(
      { user_id: userId, moves, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .then(({ error }) => { if (error) console.warn('[warmup] sync:', error.message) })
}
