import { X } from 'lucide-react'
import type { Meal } from '../types'

interface Props {
  meal: Meal
  onDelete: (id: number) => void
}

/** One row of a list group (design `.list`): surface-1, no borders, the
 *  group's 2px gaps separate rows. Name/description left, kcal right. */
export function MealRow({ meal, onDelete }: Props) {
  return (
    <div className="flex min-h-[72px] w-full items-center gap-3 bg-[var(--surface-1)] py-2 pl-4 pr-1">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Kuva-analyysin kuvaus, kun ateria on kirjattu kuvasta. Käsin
            kirjatulla ei ole kuvausta, ja rivi näyttää silloin entiseltään. */}
        <span className="truncate text-[16px] leading-6 text-text">{meal.description || 'Ateria'}</span>
        <span className="text-[14px] leading-5 tabular-nums text-fg-muted">
          {meal.protein > 0 ? `${meal.protein.toFixed(1).replace('.', ',')} g proteiinia` : 'Ei proteiinia kirjattu'}
        </span>
      </div>
      <span className="shrink-0 text-[16px] font-medium leading-6 tabular-nums text-text">
        {meal.kcal.toLocaleString('fi-FI')}
      </span>
      <button
        className="icon-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-danger"
        onClick={() => onDelete(meal.id)}
        aria-label="Poista ateria"
      >
        <X size={18} />
      </button>
    </div>
  )
}
