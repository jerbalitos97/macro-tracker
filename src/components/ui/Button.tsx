import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'action'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const base = 'inline-flex items-center justify-center rounded-[10px] font-mono cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary: 'flex-1 px-4 py-3 text-[13px] font-bold tracking-[0.03em] bg-accent text-bg',
  secondary: 'flex-1 px-4 py-3 text-[13px] bg-white/[0.07] text-text border border-white/10',
  ghost: 'px-4 py-3 text-[13px] bg-transparent text-muted border border-white/[0.08]',
  action: 'gap-1.5 px-[14px] py-[11px] text-xs bg-surface text-text border border-white/[0.08]',
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
