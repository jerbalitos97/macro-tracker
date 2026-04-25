import { s } from '../styles/tokens'

interface Props {
  value: number      // 0–1
  color?: string
  height?: number
}

export function ProgressBar({ value, color = '#d4b85a', height = 4 }: Props) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div style={{ ...s.progressBg, height, marginTop: 10 }}>
      <div
        style={{
          ...s.progressFill,
          width: `${pct}%`,
          backgroundColor: color,
          height: '100%',
        }}
      />
    </div>
  )
}
