interface Props {
  onMigrate: () => Promise<void>
  onSkip: () => void
  migrating: boolean
}

export function MigrationPrompt({ onMigrate, onSkip, migrating }: Props) {
  return (
    <div className="banner-enter flex items-start gap-3 border-b border-accent/[0.18] bg-accent/[0.08] px-4 py-3">
      <span className="mt-px flex-shrink-0 text-[16px]">☁️</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 mb-2 text-[12px] leading-[1.45] text-fg-dim">
          Löydettiin paikallista dataa. Haluatko siirtää sen pilvipalveluun?
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onMigrate}
            disabled={migrating}
            className={[
              'cursor-pointer rounded-[8px] border-none px-3.5 py-1.5 text-[12px] font-bold',
              migrating
                ? 'bg-[rgba(9,11,20,0.50)] text-fg-ghost cursor-not-allowed'
                : 'bg-accent text-bg',
            ].join(' ')}
          >
            {migrating ? 'Siirretään…' : 'Siirrä pilveen'}
          </button>
          <button
            onClick={onSkip}
            disabled={migrating}
            className="cursor-pointer rounded-[8px] border border-white/[0.1] bg-transparent px-3.5 py-1.5 text-[12px] text-fg-faint"
          >
            Ohita
          </button>
        </div>
      </div>
    </div>
  )
}
