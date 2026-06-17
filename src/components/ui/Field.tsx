import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
}

export function Field({ label, className = '', ...props }: Props) {
  return (
    <label className="block">
      {label != null && (
        <span className="mb-2 block truncate font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-fg-dim">{label}</span>
      )}
      <input
        className={`mb-2 w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-sm text-text [color-scheme:dark] ${className}`}
        {...props}
      />
    </label>
  )
}
