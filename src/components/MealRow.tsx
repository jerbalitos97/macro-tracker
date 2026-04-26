import { X } from 'lucide-react'
import type { Meal } from '../types'

interface Props {
  meal: Meal
  onDelete: (id: number) => void
}

export function MealRow({ meal, onDelete }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '11px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Left accent stripe */}
        <div
          style={{
            width: 3,
            height: 28,
            borderRadius: 2,
            backgroundColor: 'rgba(212,184,90,0.35)',
            flexShrink: 0,
          }}
        />
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 650,
              color: '#ebebeb',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}
          >
            {meal.kcal.toLocaleString('fi-FI')}
            <span style={{ fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 4 }}>kcal</span>
          </div>
          {meal.protein > 0 && (
            <div
              style={{
                fontSize: 11,
                color: '#6a9ad4',
                marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {meal.protein.toFixed(1)} g P
            </div>
          )}
        </div>
      </div>

      <button
        className="icon-btn"
        onClick={() => onDelete(meal.id)}
        aria-label="Poista ateria"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#3a3a3a',
          cursor: 'pointer',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          minHeight: 'auto',
          minWidth: 'auto',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#e87a6a')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#3a3a3a')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
