/**
 * Aurora Glass ambient background — drifting cyan/violet/blue blobs over the
 * ink canvas. Rendered as a real, fixed DOM layer behind all content (-z-10)
 * so the glass cards' `backdrop-filter: blur(...)` can sample it.
 *
 * `contain: paint` is load-bearing: a position:fixed layer whose blurred blobs
 * bleed past the viewport otherwise makes the page horizontally pannable on iOS
 * Safari (even with overflow-x:clip on <body>), which shifts the whole app
 * column left and clips the first characters. Containment stops this layer from
 * ever contributing to scroll width. Decorative only — drift self-disables under
 * prefers-reduced-motion (see global.css).
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg [contain:layout_paint]"
    >
      {/* Blobs are anchored within the horizontal viewport bounds (no negative
          left/right); the heavy blur bleeds softly off each edge without
          extending layout/scroll width. Vertical bleed is harmless (clipped). */}
      {/* top-right — cyan */}
      <div
        className="animate-aurora-1 absolute right-0 -top-20 h-[320px] w-[320px] rounded-full opacity-50 blur-[55px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      {/* upper-middle left — violet */}
      <div
        className="animate-aurora-2 absolute left-0 top-[26%] h-[300px] w-[300px] rounded-full opacity-45 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
      {/* lower-middle right — blue */}
      <div
        className="animate-aurora-1 absolute right-0 top-[58%] h-[300px] w-[300px] rounded-full opacity-40 blur-[58px]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />
      {/* bottom-left — cyan glow to anchor the base */}
      <div
        className="animate-aurora-2 absolute -bottom-24 left-0 h-[300px] w-[300px] rounded-full opacity-40 blur-[55px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
    </div>
  )
}
