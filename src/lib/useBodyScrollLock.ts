import { useEffect } from 'react'

/**
 * Lock body scrolling while a modal/overlay is mounted. On iOS Safari
 * `body { overflow: hidden }` is silently ignored for touch scrolls;
 * the only reliable lock is to set `position: fixed` on the body and
 * pin it at the negative of the current scroll offset, then restore
 * the scroll position on unmount.
 *
 * Ref-counted so nested modals work — only the first lock saves
 * state, only the last unlock restores it.
 */
let lockCount = 0
let savedScrollY = 0
let savedStyle: {
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
} | null = null

export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return

    if (lockCount === 0) {
      savedScrollY = window.scrollY
      const body = document.body
      savedStyle = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      }
      body.style.position = 'fixed'
      body.style.top = `-${savedScrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
    }
    lockCount += 1

    return () => {
      lockCount -= 1
      if (lockCount === 0 && savedStyle) {
        const body = document.body
        body.style.position = savedStyle.position
        body.style.top = savedStyle.top
        body.style.left = savedStyle.left
        body.style.right = savedStyle.right
        body.style.width = savedStyle.width
        body.style.overflow = savedStyle.overflow
        savedStyle = null
        window.scrollTo(0, savedScrollY)
      }
    }
  }, [active])
}
