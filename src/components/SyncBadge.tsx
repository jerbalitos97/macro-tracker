export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface Props {
  status: SyncStatus
}

const LABEL: Record<SyncStatus, string> = {
  idle:    '',
  syncing: 'Synkr.…',
  synced:  '✓',
  error:   'Virhe',
  offline: 'Offline',
}

// Dynamic border/text colors keyed by status — kept inline as they are truly data-driven.
const COLOR: Record<SyncStatus, string> = {
  idle:    'transparent',
  syncing: 'rgba(212,184,90,0.55)',
  synced:  'rgba(100,200,120,0.55)',
  error:   'rgba(232,122,106,0.55)',
  offline: 'rgba(255,255,255,0.2)',
}

export function SyncBadge({ status }: Props) {
  if (status === 'idle') return null

  const color = COLOR[status]

  return (
    <div
      className="flex items-center gap-[5px] whitespace-nowrap rounded-full border px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[0.08em] transition-all duration-300"
      style={{ borderColor: color, color }}
    >
      {status === 'syncing' && (
        <span
          className="pulse-dot h-[5px] w-[5px] flex-shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {LABEL[status]}
    </div>
  )
}
