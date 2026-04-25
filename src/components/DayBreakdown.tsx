import type { ComputedDay } from '../types'
import { s } from '../styles/tokens'

interface Props {
  day: ComputedDay
}

export function DayBreakdown({ day }: Props) {
  return (
    <div>
      <div style={s.breakdownRow}>
        <span style={s.breakdownLabel}>TDEE ({day.dayType})</span>
        <span style={s.breakdownVal}>+{day.baseTdee}</span>
      </div>
      <div style={s.breakdownRow}>
        <span style={s.breakdownLabel}>Cut-vaje (perus)</span>
        <span style={{ ...s.breakdownVal, color: '#888' }}>−{day.dailyDeficitBase}</span>
      </div>
      {day.preBufferReduction > 0 && (
        <div style={s.breakdownRow}>
          <span style={s.breakdownLabel}>Pre-buffer</span>
          <span style={{ ...s.breakdownVal, color: '#e87a6a' }}>−{day.preBufferReduction}</span>
        </div>
      )}
      {day.extraKcal > 0 && (
        <div style={s.breakdownRow}>
          <span style={s.breakdownLabel}>Ekstratreeni</span>
          <span style={{ ...s.breakdownVal, color: '#6a9ad4' }}>+{day.extraKcal}</span>
        </div>
      )}
      {day.event && (
        <div style={s.breakdownRow}>
          <span style={s.breakdownLabel}>Juhla</span>
          <span style={{ ...s.breakdownVal, color: '#d4b85a' }}>+{day.event.excessKcal}</span>
        </div>
      )}
      <div
        style={{
          ...s.breakdownRow,
          borderTop: '1px solid #1f1f1f',
          paddingTop: 8,
          marginTop: 6,
        }}
      >
        <span style={{ ...s.breakdownLabel, color: '#e5e5e5', fontWeight: 600 }}>Budjetti</span>
        <span
          style={{
            ...s.breakdownVal,
            color: '#d4b85a',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {day.budget.toLocaleString('fi-FI')} kcal
        </span>
      </div>
    </div>
  )
}
