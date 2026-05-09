import { useEffect } from 'react'

/**
 * Lock body scrolling while a modal/overlay is mounted. Restores the
 * previous overflow value on unmount. Stacking multiple locks works:
 * each mount increments a counter, last unmount restores.
 *
 * Without this, iOS Safari can rubber-band the page underneath an
 * open `position: fixed` modal, dragging the sticky NavBar into the
 * modal area and dropping the modal's internal scroll position.
 */
let lockCount = 0
let prevOverflow: string | null = null

export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return
    if (lockCount === 0) {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = prevOverflow ?? ''
        prevOverflow = null
      }
    }
  }, [active])
}
