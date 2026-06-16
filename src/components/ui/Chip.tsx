import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function Chip({ active = false, className = '', ...props }: Props) {
  return (
    <button
      className={`inline-flex min-h-0 min-w-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[11px] transition-colors ${
        active ? 'border border-border-hi bg-accent/[0.12] text-text' : 'border border-border bg-surface text-muted'
      } ${className}`}
      {...props}
    />
  )
}
