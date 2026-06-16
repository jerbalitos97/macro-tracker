import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'solid' | 'glass'
}

const VARIANTS = {
  solid: 'rounded-card border border-border bg-surface p-4',
  glass:
    'rounded-glass border border-white/[0.14] bg-white/[0.06] p-5 ' +
    '[backdrop-filter:blur(26px)_saturate(180%)] [-webkit-backdrop-filter:blur(26px)_saturate(180%)] ' +
    'shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]',
} as const

export function Card({ className = '', variant = 'solid', ...props }: Props) {
  return <div className={`${VARIANTS[variant]} ${className}`} {...props} />
}
