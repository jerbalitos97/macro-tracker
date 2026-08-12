import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'hero' | 'glass' | 'panel' | 'row' | 'solid'
}

// Aurora Glass — three translucent tiers stacked over the aurora blob layer.
// `glass` aliases `hero` and `solid` aliases `panel` so existing callers
// upgrade without churn. backdrop-filter is inline so it reads the fixed
// AuroraBackground sibling behind the app.
//
// The base is a dark translucent ink rather than a white tint. A white tint on
// top of a saturated backdrop-filter let the aurora through at up to 0.12
// relative luminance, which no readable secondary text colour can sit on — a
// pixel sweep of every card interior had small text measuring 1.8–3.1:1. The
// ink holds the ground near 0.05 while keeping the blur and the glass edge, so
// the text ramp has somewhere to stand.
const HERO =
  'rounded-card border border-white/[0.12] bg-[rgba(9,11,20,0.55)] p-6 ' +
  '[backdrop-filter:blur(22px)_saturate(180%)] [-webkit-backdrop-filter:blur(22px)_saturate(180%)] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_20px_40px_-20px_rgba(0,0,0,0.6)]'

const PANEL =
  'rounded-panel border border-white/10 bg-[rgba(9,11,20,0.5)] p-5 ' +
  '[backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)]'

const ROW =
  'rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-4 ' +
  '[backdrop-filter:blur(14px)_saturate(150%)] [-webkit-backdrop-filter:blur(14px)_saturate(150%)]'

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
