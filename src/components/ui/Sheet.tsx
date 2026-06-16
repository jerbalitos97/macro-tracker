import type { ReactNode } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: Props) {
  useBodyScrollLock(open)
  const reduce = useReducedMotion()

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
          />
          <m.div
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[101] mx-auto max-h-[calc(100dvh-env(safe-area-inset-top)-64px)] w-full max-w-[480px] overflow-y-auto rounded-t-sheet border border-white/10 bg-modal px-5 pt-6 pb-[max(40px,calc(env(safe-area-inset-bottom)+24px))] [-webkit-overflow-scrolling:touch] [box-shadow:0_-16px_60px_rgba(0,0,0,0.7)] [overscroll-behavior:contain]"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 -mt-2 h-1 w-9 rounded-full bg-white/15" />
            {title != null && (
              <div className="mb-[18px] flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-accent">
                {title}
              </div>
            )}
            {children}
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
