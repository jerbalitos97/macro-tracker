interface Props {
  onMigrate: () => Promise<void>
  onSkip: () => void
  migrating: boolean
}

export function MigrationPrompt({ onMigrate, onSkip, migrating }: Props) {
  return (
    <div
      className="banner-enter"
      style={{
        backgroundColor: 'rgba(212,184,90,0.08)',
        borderBottom: '1px solid rgba(212,184,90,0.18)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>☁️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: '0 0 8px',
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.45,
          }}
        >
          Löydettiin paikallista dataa. Haluatko siirtää sen pilvipalveluun?
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={onMigrate}
            disabled={migrating}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: migrating ? 'rgba(255,255,255,0.06)' : '#d4b85a',
              color: migrating ? 'rgba(255,255,255,0.2)' : '#000',
              fontSize: 12,
              fontWeight: 700,
              cursor: migrating ? 'not-allowed' : 'pointer',
            }}
          >
            {migrating ? 'Siirretään…' : 'Siirrä pilveen'}
          </button>
          <button
            onClick={onSkip}
            disabled={migrating}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              backgroundColor: 'transparent',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Ohita
          </button>
        </div>
      </div>
    </div>
  )
}
