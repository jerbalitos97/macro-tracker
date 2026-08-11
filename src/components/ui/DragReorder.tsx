import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { m, useDragControls } from 'motion/react'

// Shared long-press-to-drag reordering, extracted from the workout logger so
// the template grid, the warm-up editor and the template editor all behave the
// same way. Two entry points into a drag:
//
//   • longPress — hold anywhere on the item (iOS home-screen feel). Right for
//     tiles whose whole surface is a single tap target.
//   • a grip handle — press and go, no wait. Right for rows containing text
//     inputs, where a hold on the row itself must still put the caret in a
//     field.
//
// Both always ship with keyboard move (WCAG 2.5.7 wants a non-dragging path):
// focus the item and press Alt+Arrow.

/** Hold this long anywhere on an item to pick it up. */
export const LONG_PRESS_MS = 350
/** Move further than this before the hold completes and it's a scroll, not a lift. */
const MOVE_TOLERANCE_PX = 10
/** Clicks arriving this soon after a drag are the drag's own click — ignore them. */
const CLICK_SUPPRESS_MS = 300

export interface DragReorder {
  /** Put this on the element wrapping the draggable items. */
  containerRef: React.RefObject<HTMLDivElement>
  measure: () => void
  drop: (fromId: string, point: { x: number; y: number }) => void
}

/** Wires up hit-testing for a list or grid. `onReorder` receives the dragged
 *  item's id and the id of whichever item it was dropped on top of. */
export function useDragReorder(onReorder: (fromId: string, toId: string) => void): DragReorder {
  const containerRef = useRef<HTMLDivElement>(null)
  const rects = useRef<Array<{ id: string; rect: DOMRect }>>([])

  const measure = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    rects.current = Array.from(root.querySelectorAll<HTMLElement>('[data-dragid]')).map((el) => ({
      id: el.dataset.dragid as string,
      rect: el.getBoundingClientRect(),
    }))
  }, [])

  const drop = useCallback(
    (fromId: string, point: { x: number; y: number }) => {
      // info.point is page-space; the rects were captured in viewport-space.
      const x = point.x - window.scrollX
      const y = point.y - window.scrollY
      const hit = rects.current.find(
        ({ id, rect }) => id !== fromId && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      )
      if (hit) onReorder(fromId, hit.id)
    },
    [onReorder],
  )

  return { containerRef, measure, drop }
}

/** Props to spread onto a grip element so pressing it starts a drag at once. */
export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  'aria-hidden': true
}

export interface DragItemApi {
  lifted: boolean
  handleProps: HandleProps
}

interface Props {
  id: string
  reorder: DragReorder
  /** Hold anywhere on the item to lift it. Leave off for rows with inputs. */
  longPress?: boolean
  /** Tap / Enter / Space. Omit for items that aren't themselves buttons. */
  onActivate?: () => void
  /** Keyboard reorder (Alt+Arrow). Null ends of the list are handled upstream. */
  onMove?: (delta: -1 | 1) => void
  role?: string
  tabIndex?: number
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  children: ReactNode | ((api: DragItemApi) => ReactNode)
}

export function DragItem({
  id, reorder, longPress = false, onActivate, onMove,
  role, tabIndex, ariaLabel, className, style, children,
}: Props) {
  const controls = useDragControls()
  const [lifted, setLifted] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const dragEndedAt = useRef(0)

  const cancelPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressOrigin.current = null
  }, [])

  const beginDrag = useCallback((e: React.PointerEvent) => {
    cancelPress()
    setLifted(true)
    reorder.measure()
    controls.start(e)
    // Light haptic where supported (Android); a no-op on iOS Safari.
    navigator.vibrate?.(12)
  }, [cancelPress, controls, reorder])

  // The item keeps `touch-action: auto` so the page still scrolls under a
  // swipe. Once it is lifted, block scrolling for the rest of the gesture —
  // changing touch-action mid-touch is not honoured on iOS, but a non-passive
  // preventDefault is.
  useEffect(() => {
    if (!lifted) return
    const block = (e: TouchEvent) => e.preventDefault()
    window.addEventListener('touchmove', block, { passive: false })
    return () => window.removeEventListener('touchmove', block)
  }, [lifted])

  useEffect(() => cancelPress, [cancelPress])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!longPress || !e.isPrimary) return
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      beginDrag(e)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const origin = pressOrigin.current
    if (!origin || pressTimer.current === null) return
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_TOLERANCE_PX) cancelPress()
  }

  const handleProps: HandleProps = {
    onPointerDown: (e) => { e.preventDefault(); e.stopPropagation(); beginDrag(e) },
    'aria-hidden': true,
  }

  return (
    <m.div
      layout
      data-dragid={id}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-keyshortcuts={onMove ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={(e) => {
        // Rows can contain text fields; leave their own key handling alone
        // (Alt+Arrow is word navigation inside an input on macOS).
        const t = e.target as HTMLElement
        if (t !== e.currentTarget && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
        if (onMove && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
          e.preventDefault(); onMove(-1); return
        }
        if (onMove && e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
          e.preventDefault(); onMove(1); return
        }
        if (onActivate && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onActivate() }
      }}
      drag
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragMomentum={false}
      whileDrag={{ scale: 1.06, zIndex: 40, boxShadow: '0 14px 36px rgba(0,0,0,0.55)' }}
      whileTap={lifted || !onActivate ? undefined : { scale: 0.97 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={() => { cancelPress(); setLifted(false) }}
      onDragEnd={(_, info) => {
        dragEndedAt.current = Date.now()
        setLifted(false)
        reorder.drop(id, info.point)
      }}
      onClick={onActivate ? () => {
        // The click that ends a drag arrives right after it — ignore that one
        // only. A timestamp self-heals if a drag ever ends without a click.
        if (lifted || Date.now() - dragEndedAt.current < CLICK_SUPPRESS_MS) return
        onActivate()
      } : undefined}
      className={className}
      style={style}
    >
      {typeof children === 'function' ? children({ lifted, handleProps }) : children}
    </m.div>
  )
}

/** Moves `fromId` to `toId`'s slot, returning a new array. */
export function moveById<T extends { id: string }>(arr: T[], fromId: string, toId: string): T[] {
  const from = arr.findIndex((x) => x.id === fromId)
  const to = arr.findIndex((x) => x.id === toId)
  if (from < 0 || to < 0 || from === to) return arr
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Moves the item one slot up (-1) or down (1). Returns the same array at the ends. */
export function moveByDelta<T extends { id: string }>(arr: T[], id: string, delta: -1 | 1): T[] {
  const from = arr.findIndex((x) => x.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= arr.length) return arr
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
