import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

// Material 3 filter chip: 32px tall, 8px corners, 14px label. The 44px
// minimum from global.css is lifted (min-h-0) because chips sit in rows; the
// row's gap keeps neighbours from being hit by mistake.
export function Chip({ active = false, className = '', ...props }: Props) {
  return (
    <button
      className={`inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] font-medium transition-colors ${
        active ? 'border border-transparent bg-cyan/[0.16] text-[#a5f3fc]' : 'border border-white/[0.18] bg-transparent text-fg-muted'
      } ${className}`}
      {...props}
    />
  )
}
