// Training blocks (mesocycles) shown on the workout calendar. Synced to
// Supabase (workout_blocks) with localStorage as the offline cache, matching
// how templates and workout history work.
import { supabase } from './supabase'
import { uid, TEMPLATE_COLORS } from './workouts'
import { toISO, addDays, daysBetween } from './dates'

const K_BLOCKS = 'mimir.workouts.blocks:v1'
/** Start nagging this many days before a block ends. */
export const BLOCK_ENDING_SOON_DAYS = 7

export interface TrainingBlock {
  id: string
  name: string
  /** Inclusive ISO yyyy-mm-dd. */
  startDate: string
  /** Inclusive ISO yyyy-mm-dd. */
  endDate: string
  color: string
  note?: string
  /** What the block is for — drives what deficit it tolerates. See
   *  lib/planning.ts. Absent on blocks created before intents existed; those
   *  read as 'other'. Typed as string here so blocks.ts stays free of a
   *  dependency on planning.ts, which imports from it. */
  intent?: string
  createdAt: string
  updatedAt: string
}

export const BLOCK_COLORS = TEMPLATE_COLORS

// ── Local cache ────────────────────────────────────────────────────────────────
export function getBlocks(): TrainingBlock[] {
  try {
    const raw = localStorage.getItem(K_BLOCKS)
    if (!raw) return []
    const arr = JSON.parse(raw) as TrainingBlock[]
    return Array.isArray(arr) ? sortBlocks(arr) : []
  } catch {
    return []
  }
}

function write(blocks: TrainingBlock[]): TrainingBlock[] {
  const next = sortBlocks(blocks)
  try {
    localStorage.setItem(K_BLOCKS, JSON.stringify(next))
  } catch {
    // best-effort; ignore quota/availability errors
  }
  return next
}

const sortBlocks = (b: TrainingBlock[]): TrainingBlock[] =>
  [...b].sort((x, y) => x.startDate.localeCompare(y.startDate))

export function saveBlockLocal(b: TrainingBlock): TrainingBlock[] {
  return write([...getBlocks().filter((x) => x.id !== b.id), b])
}

export function deleteBlockLocal(id: string): TrainingBlock[] {
  return write(getBlocks().filter((x) => x.id !== id))
}

export function newBlock(startDate: string, weeks = 6): TrainingBlock {
  const now = new Date().toISOString()
  return {
    id: uid(),
    name: '',
    startDate,
    endDate: addDays(startDate, weeks * 7 - 1),
    color: BLOCK_COLORS[0],
    intent: 'base',
    createdAt: now,
    updatedAt: now,
  }
}

// ── Cloud sync ─────────────────────────────────────────────────────────────────
interface BlockRow {
  id: string
  name: string
  start_date: string
  end_date: string
  color: string | null
  note: string | null
  intent: string | null
  created_at: string
  updated_at: string
}

const fromRow = (r: BlockRow): TrainingBlock => ({
  id: r.id,
  name: r.name,
  startDate: r.start_date,
  endDate: r.end_date,
  color: r.color ?? BLOCK_COLORS[0],
  note: r.note ?? undefined,
  intent: r.intent ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

/** Fetch blocks from the cloud and refresh the local cache. Blocks created
 *  offline are pushed up rather than dropped. Falls back to the cache when
 *  offline. */
export async function pullBlocks(userId: string): Promise<TrainingBlock[]> {
  if (!supabase) return getBlocks()
  const { data, error } = await supabase
    .from('workout_blocks')
    .select('*')
    .eq('user_id', userId)
  if (error) {
    console.warn('[blocks] pull:', error.message)
    return getBlocks()
  }
  const cloud = (data ?? []).map((r) => fromRow(r as BlockRow))
  const cloudIds = new Set(cloud.map((b) => b.id))
  const localOnly = getBlocks().filter((b) => !cloudIds.has(b.id))
  for (const b of localOnly) syncBlockCloud(userId, b)
  return write([...cloud, ...localOnly])
}

export function syncBlockCloud(userId: string, b: TrainingBlock): void {
  supabase
    ?.from('workout_blocks')
    .upsert({
      id: b.id,
      user_id: userId,
      name: b.name,
      start_date: b.startDate,
      end_date: b.endDate,
      color: b.color,
      note: b.note ?? null,
      intent: b.intent ?? null,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
    })
    .then(({ error }) => { if (error) console.warn('[blocks] sync:', error.message) })
}

export function deleteBlockCloud(userId: string, id: string): void {
  supabase
    ?.from('workout_blocks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .then(({ error }) => { if (error) console.warn('[blocks] delete:', error.message) })
}

// ── Derived state ──────────────────────────────────────────────────────────────
export interface BlockStatus {
  current: TrainingBlock | null
  next: TrainingBlock | null
  /** Days from today until the current block's last day, inclusive of today. */
  daysLeft: number | null
  /** 0–1 through the current block. */
  progress: number | null
  /** Days until the next block starts. */
  daysToNext: number | null
  endingSoon: boolean
}

export function blockForDate(blocks: TrainingBlock[], dateISO: string): TrainingBlock | null {
  return blocks.find((b) => dateISO >= b.startDate && dateISO <= b.endDate) ?? null
}

export function blockStatus(blocks: TrainingBlock[], todayISO = toISO(new Date())): BlockStatus {
  const current = blockForDate(blocks, todayISO)
  const next = blocks.find((b) => b.startDate > todayISO) ?? null

  const daysLeft = current ? daysBetween(todayISO, current.endDate) + 1 : null
  const total = current ? daysBetween(current.startDate, current.endDate) + 1 : null
  const elapsed = current ? daysBetween(current.startDate, todayISO) : null
  const progress =
    total && total > 0 && elapsed !== null ? Math.min(1, Math.max(0, (elapsed + 1) / total)) : null

  return {
    current,
    next,
    daysLeft,
    progress,
    daysToNext: next ? daysBetween(todayISO, next.startDate) : null,
    endingSoon: daysLeft !== null && daysLeft <= BLOCK_ENDING_SOON_DAYS && daysLeft > 0,
  }
}

/** Overlapping blocks make "which block is today in" ambiguous — the editor
 *  blocks saving them. Returns the first conflicting block, if any. */
export function findOverlap(
  blocks: TrainingBlock[],
  candidate: Pick<TrainingBlock, 'id' | 'startDate' | 'endDate'>,
): TrainingBlock | null {
  return (
    blocks.find(
      (b) =>
        b.id !== candidate.id &&
        candidate.startDate <= b.endDate &&
        candidate.endDate >= b.startDate,
    ) ?? null
  )
}
