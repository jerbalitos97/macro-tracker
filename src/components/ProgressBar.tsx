interface Props {
  value: number      // 0–1
  color?: string
  height?: number
  gradient?: boolean // gradient fill: slightly lighter at the right edge
  animate?: boolean  // grow from 0 on mount
}

export function ProgressBar({
  value,
  color = '#d4b85a',
  height = 6,
  gradient = true,
  animate = true,
}: Props) {
  const pct = Math.min(100, Math.max(0, value * 100))

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
      }}
    >
      <div
        className={animate ? 'progress-bar-fill' : undefined}
        style={{
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
