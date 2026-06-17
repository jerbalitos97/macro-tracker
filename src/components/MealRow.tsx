import { X } from 'lucide-react'
import type { Meal } from '../types'

interface Props {
  meal: Meal
  onDelete: (id: number) => void
}

export function MealRow({ meal, onDelete }: Props) {
  return (
    <div className="flex w-full items-center justify-between border-b border-white/[0.05] py-[11px]">
      <div className="flex min-w-0 items-center gap-3">
        {/* Left accent stripe */}
        <div className="h-7 w-[3px] flex-shrink-0 rounded-sm bg-accent/35" />
        <div className="min-w-0">
          <div className="text-[15px] font-[650] tabular-nums tracking-[-0.01em] text-text">
            {meal.kcal.toLocaleString('fi-FI')}
            <span className="ml-1 text-[11px] font-normal text-[#555]">kcal</span>
          </div>
          {meal.protein > 0 && (
            <div className="mt-px text-[11px] tabular-nums text-protein">
              {meal.protein.toFixed(1)} g P
            </div>
          )}
        </div>
      </div>

      <button
        className="icon-btn flex items-center justify-center rounded-md bg-transparent border-none p-2 text-[#3a3a3a] transition-colors hover:text-danger"
        onClick={() => onDelete(meal.id)}
        aria-label="Poista ateria"
      >
        <X size={14} />
      </button>
    </div>
  )
}
