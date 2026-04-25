import { Trash2 } from 'lucide-react'
import type { Meal } from '../types'
import { s } from '../styles/tokens'

interface Props {
  meal: Meal
  onDelete: (id: number) => void
}

export function MealRow({ meal, onDelete }: Props) {
  return (
    <div style={s.mealRow}>
      <div>
        <span style={s.mealKcal}>{meal.kcal} kcal</span>
        <span style={s.mealProtein}>{meal.protein} g P</span>
      </div>
      <button onClick={() => onDelete(meal.id)} style={s.iconBtn}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}
