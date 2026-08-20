import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, m, useDragControls, useReducedMotion } from 'motion/react'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Wash the whole sheet — border, panel and backdrop — in this colour.
   *
   *  For the hold clock, where the point is to be readable out of the corner of
   *  an eye while you are upside down in the position. Digits alone ask to be
   *  looked at; a surface that changes is seen without looking. Kept faint
   *  (a border tint and a ~12% gradient) so the text on top never loses
   *  contrast, and the colour never carries meaning on its own — it only marks
   *  that something changed. */
  tint?: string
}

export function Sheet({ open, onClose, title, children, tint }: Props) {
  useBodyScrollLock(open)
  const reduce = useReducedMotion()
  // Swipe-to-dismiss starts from the grab handle only — a drag listener on
  // the whole sheet would set touch-action there and kill native scrolling
  // of overflowing content on touch devices.
  const dragControls = useDragControls()

  // Escape closes it. The other two ways out — swiping the handle and tapping
  // the backdrop — are both pointer gestures, so without this a keyboard user
  // has no way to dismiss an open sheet at all.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-[6px] [overscroll-behavior:contain]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          >
            {tint && (
              <div
                aria-hidden
                data-sheet-tint="backdrop"
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(120% 60% at 50% 100%, ${tint}2e 0%, transparent 70%)`,
                  transition: 'background 400ms var(--smooth)',
                }}
              />
            )}
          </m.div>
          <m.div
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[101] mx-auto max-h-[calc(100dvh-env(safe-area-inset-top)-64px)] w-full max-w-[480px] overflow-y-auto rounded-t-sheet border border-white/10 bg-modal px-5 pt-6 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] [-webkit-overflow-scrolling:touch] [box-shadow:0_-16px_60px_rgba(0,0,0,0.7)] [overscroll-behavior:contain]"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={reduce ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              touchAction: 'pan-y',
              ...(tint
                ? { borderColor: `${tint}59`, transition: 'border-color 400ms var(--smooth)' }
                : null),
            }}
          >
            {tint && (
              <div
                aria-hidden
                data-sheet-tint="panel"
                className="pointer-events-none absolute inset-0 rounded-t-sheet"
                style={{
                  background: `linear-gradient(180deg, ${tint}1f 0%, ${tint}0a 45%, transparent 100%)`,
                  transition: 'background 400ms var(--smooth)',
                }}
              />
            )}
            <div
              onPointerDown={(e) => { if (!reduce) dragControls.start(e) }}
              className="relative -mx-5 -mt-6 cursor-grab touch-none px-5 pb-3 pt-4 active:cursor-grabbing"
            >
              <div className="mx-auto h-1 w-9 rounded-full bg-white/15" />
            </div>
            {title != null && (
              <div
                className="relative mb-[18px] flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-accent"
                style={tint ? { color: tint, transition: 'color 400ms var(--smooth)' } : undefined}
              >
                {title}
              </div>
            )}
            <div className="relative">{children}</div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
