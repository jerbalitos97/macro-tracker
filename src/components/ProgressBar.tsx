interface Props {
  value: number      // 0–1
  color?: string
  height?: number
  gradient?: boolean // gradient fill: slightly lighter at the right edge
  animate?: boolean  // grow from 0 on mount
  /** A second, translucent fill on the same track: where the value *should* be.
   *  On one line the comparison needs no reading — the solid bar either reaches
   *  past the faint one or falls short of it. Two separate bars would make that
   *  a measurement rather than a glance. 0–1, omit for no pace marker. */
  ghost?: number
  /** Accessible description of the ghost, e.g. "tavoitetahti 3 100 kcal". */
  ghostLabel?: string
}

export function ProgressBar({
  value,
  color = '#22d3ee',
  height = 6,
  gradient = true,
  animate = true,
  ghost,
  ghostLabel,
}: Props) {
  const pct = Math.min(100, Math.max(0, value * 100))
  const ghostPct = ghost == null ? null : Math.min(100, Math.max(0, ghost * 100))

  // Derive a lighter version of the accent colour for the gradient end
  const fillStyle: React.CSSProperties = gradient
    ? { background: `linear-gradient(90deg, ${color}bb 0%, ${color} 100%)` }
    : { backgroundColor: color }

  return (
    <div
      style={{
        height,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: height,
        overflow: 'hidden',
        marginTop: 12,
        position: 'relative',
      }}
    >
      {ghostPct != null && (
        <div
          aria-label={ghostLabel}
          title={ghostLabel}
          style={{
            position: 'absolute',
            inset: 0,
            width: `${ghostPct}%`,
            height: '100%',
            borderRadius: height,
            backgroundColor: color,
            opacity: 0.26,
            transition: 'width 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      )}
      <div
        className={animate ? 'progress-bar-fill' : undefined}
        style={{
          position: 'relative',
          width: `${pct}%`,
          height: '100%',
          borderRadius: height,
          transition: 'width 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
          ...fillStyle,
        }}
      />
    </div>
  )
}
