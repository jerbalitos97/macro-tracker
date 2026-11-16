import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
}

export function Field({ label, className = '', ...props }: Props) {
  // min-w-0 on the label: as a grid/flex item it would otherwise inherit the
  // input's intrinsic width as its minimum and refuse to fit its column.
  return (
    <label className="block min-w-0">
      {label != null && (
        <span className="mb-1.5 block truncate text-[12px] font-medium text-fg-dim">{label}</span>
      )}
      <input
        className={`mb-2 h-12 w-full rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-4 text-base text-text [color-scheme:dark] ${className}`}
        {...props}
      />
    </label>
  )
}
