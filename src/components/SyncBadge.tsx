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

const COLOR: Record<SyncStatus, string> = {
  idle:    'transparent',
  syncing: 'rgba(212,184,90,0.55)',
  synced:  'rgba(100,200,120,0.55)',
  error:   'rgba(232,122,106,0.55)',
  offline: 'rgba(255,255,255,0.2)',
}

export function SyncBadge({ status }: Props) {
  if (status === 'idle') return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 20,
        border: `1px solid ${COLOR[status]}`,
        fontSize: 10,
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: COLOR[status],
        transition: 'all 0.3s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {status === 'syncing' && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: COLOR[status],
            animation: 'pulse-dot 1s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
      )}
      {LABEL[status]}
    </div>
  )
}
