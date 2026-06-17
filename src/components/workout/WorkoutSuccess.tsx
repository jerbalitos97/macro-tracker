import { useEffect } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'

interface Props {
  onDone: () => void
}

/** Full-screen centred success burst shown for ~2s after finishing a workout,
 *  then calls onDone (→ summary view). */
export function WorkoutSuccess({ onDone }: Props) {
  const reduce = useReducedMotion()

  useEffect(() => {
    const t = setTimeout(onDone, 2000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <m.div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-5 bg-[rgba(5,6,12,0.72)] [backdrop-filter:blur(8px)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-violet text-bg shadow-[0_0_50px_rgba(34,211,238,0.6)]"
        initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      >
        <Check size={56} strokeWidth={3} />
      </m.div>
      <m.div
        className="font-display text-[20px] font-bold tracking-[-0.01em] text-text"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        Treeni tallennettu
      </m.div>
    </m.div>
  )
}
