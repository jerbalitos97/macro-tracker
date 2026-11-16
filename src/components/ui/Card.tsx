import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'hero' | 'glass' | 'panel' | 'row' | 'solid'
}

// Material 3 tonal surfaces over the aurora. `glass` aliases `hero` and
// `solid` aliases `panel` so existing callers keep working.
//
// The glass tiers used backdrop-filter blur on every card. That cost a GPU
// pass per card while scrolling and still let the aurora through brightly
// enough that the text ramp had to be re-measured and patched (see the git
// history of this file). An ink fill at ~0.78 does the job the blur was
// standing in for: the aurora stays visible around and faintly through the
// card, and every text token keeps AA without a per-card exception.
const HERO =
  'rounded-card border border-white/[0.08] bg-[var(--surface-1)] p-6'

const PANEL =
  'rounded-panel border border-white/[0.08] bg-[var(--surface-1)] p-5'

const ROW =
  'rounded-row border border-white/[0.06] bg-[var(--surface-1)] p-4'

/** The variant classes on their own, for the rare element that needs a Card's
 *  look but not a Card's `div` (a draggable row, say). */
export const CARD_CLASSES = {
  hero:  HERO,
  glass: HERO,
  panel: PANEL,
  solid: PANEL,
  row:   ROW,
} as const

export function Card({ className = '', variant = 'panel', ...props }: Props) {
  return <div className={`${CARD_CLASSES[variant]} ${className}`} {...props} />
}
