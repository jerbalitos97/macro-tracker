import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'hero' | 'glass' | 'panel' | 'row' | 'solid'
}

// Aurora Glass — three translucent tiers stacked over the aurora blob layer.
// `glass` aliases `hero` and `solid` aliases `panel` so existing callers
// upgrade without churn. backdrop-filter is inline so it reads the fixed
// AuroraBackground sibling behind the app.
const HERO =
  'rounded-card border border-white/[0.12] bg-white/[0.07] p-6 ' +
  '[backdrop-filter:blur(22px)_saturate(180%)] [-webkit-backdrop-filter:blur(22px)_saturate(180%)] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_20px_40px_-20px_rgba(0,0,0,0.6)]'

const PANEL =
  'rounded-panel border border-white/10 bg-white/[0.05] p-5 ' +
  '[backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)]'

const ROW =
  'rounded-row border border-white/10 bg-white/[0.05] p-4 ' +
  '[backdrop-filter:blur(14px)_saturate(150%)] [-webkit-backdrop-filter:blur(14px)_saturate(150%)]'

const VARIANTS = {
  hero:  HERO,
  glass: HERO,
  panel: PANEL,
  solid: PANEL,
  row:   ROW,
} as const

export function Card({ className = '', variant = 'panel', ...props }: Props) {
  return <div className={`${VARIANTS[variant]} ${className}`} {...props} />
}
