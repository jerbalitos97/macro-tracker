import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'

/** Material 3 snackbar, the one way a screen confirms an action.
 *
 *  Replaces `confirm()` before destructive actions: the action happens at once
 *  and the snackbar offers "Kumoa" for a few seconds. A dialog in front of
 *  every delete costs a tap each time and is answered by reflex anyway; undo
 *  costs nothing when you meant it and saves you when you didn't.
 *
 *  Module-level store rather than a context so any handler can call `snack()`
 *  without threading a hook through it. One host is mounted in App. */

export interface SnackOptions {
  text: string
  /** Label for the action button, default "Kumoa" when `onAction` is given. */
  actionLabel?: string
  onAction?: () => void
  /** ms; default 5000 with an action, 2800 without. */
  duration?: number
}

interface Snack extends SnackOptions { id: number }

let current: Snack | null = null
let seq = 0
const listeners = new Set<(s: Snack | null) => void>()
const emit = () => listeners.forEach((l) => l(current))

export function snack(opts: SnackOptions | string) {
  const o = typeof opts === 'string' ? { text: opts } : opts
  current = { ...o, id: ++seq }
  emit()
}

export function dismissSnack() {
  current = null
  emit()
}

/** Bottom offset: above the navigation bar when one is shown. */
export function SnackbarHost({ aboveNav }: { aboveNav: boolean }) {
  const [s, setS] = useState<Snack | null>(current)
  const reduce = useReducedMotion()

  useEffect(() => {
    listeners.add(setS)
    return () => { listeners.delete(setS) }
  }, [])

  useEffect(() => {
    if (!s) return
    const ms = s.duration ?? (s.onAction ? 5000 : 2800)
    const id = s.id
    const t = window.setTimeout(() => { if (current?.id === id) dismissSnack() }, ms)
    return () => window.clearTimeout(t)
  }, [s])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] mx-auto w-full max-w-[480px] px-4"
      style={{ bottom: aboveNav ? 'calc(env(safe-area-inset-bottom) + 96px)' : 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <AnimatePresence>
        {s && (
          <m.div
            key={s.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-lg bg-[#DEE3E5] py-1 pl-4 pr-2 text-[14px] leading-5 text-[#2B3133] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.32, ease: [0.34, 1.4, 0.64, 1] }}
          >
            <span className="min-w-0 flex-1 py-2">{s.text}</span>
            {s.onAction && (
              <button
                type="button"
                onClick={() => { s.onAction?.(); dismissSnack() }}
                className="min-h-10 shrink-0 rounded-full px-3 text-[14px] font-semibold text-[#006874]"
              >
                {s.actionLabel ?? 'Kumoa'}
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
