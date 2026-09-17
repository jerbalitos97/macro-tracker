import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'action'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const base = 'inline-flex items-center justify-center rounded-input font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

// `press-3d` vain päätoiminnolla. Paksuus on sitä varten, että ruudun tärkein
// nappi tuntuu esineeltä sormen alla — jos jokaisella napilla olisi reunus,
// mikään ei erottuisi ja koko ruutu näyttäisi kohollaan olevalta.
// Reunuksen sävy on napin oma tummennettu sini, ei musta: musta reunus
// syaanin alla lukee likana, sinisen tummempi sävy lukee kappaleen kylkenä.
const variants: Record<Variant, string> = {
  primary:
    'press-3d flex-1 px-4 py-3 text-[13px] font-bold tracking-[0.03em] bg-gradient-to-br from-cyan to-blue text-bg ' +
    '[--ledge-color:#0e6f88] [--ledge-glow:0_10px_28px_-10px_rgba(34,211,238,0.65)]',
  secondary: 'flex-1 px-4 py-3 text-[13px] bg-[rgba(9,11,20,0.52)] text-text border border-white/10',
  ghost: 'px-4 py-3 text-[13px] bg-transparent text-fg-muted border border-white/[0.10]',
  action: 'gap-1.5 px-[14px] py-[11px] text-xs bg-[rgba(9,11,20,0.48)] text-text border border-white/[0.10]',
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
