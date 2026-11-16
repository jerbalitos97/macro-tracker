import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'action'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

// Material 3 button family, in Aurora colours:
//   primary   → filled  (cyan→blue gradient, the screen's one main action)
//   secondary → tonal   (cyan container)
//   ghost     → outlined
//   action    → tonal, compact
// Full pill shape and a 48px minimum height everywhere: M3's touch target, and
// the old 3D ledge on the primary is gone — one press language for every
// button, the global :active scale in global.css.
const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full font-sans text-[14px] font-semibold ' +
  'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary:
    'flex-1 px-6 bg-gradient-to-br from-cyan to-blue text-bg ' +
    'shadow-[0_10px_28px_-10px_rgba(34,211,238,0.65)]',
  secondary: 'flex-1 px-6 bg-cyan/[0.16] text-[#cde7ec]',
  ghost: 'px-6 bg-transparent text-text border border-white/[0.18]',
  action: 'px-4 bg-cyan/[0.12] text-[#cde7ec] font-medium',
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
