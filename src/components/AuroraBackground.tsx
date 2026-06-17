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
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [contain:layout_paint]"
      style={{
        // Base glow floor so no region is ever flat ink, even behind cards.
        backgroundColor: '#05060c',
        backgroundImage:
          'radial-gradient(130% 80% at 85% 0%, rgba(34,211,238,0.16), transparent 55%),' +
          'radial-gradient(120% 75% at 5% 42%, rgba(167,139,250,0.16), transparent 55%),' +
          'radial-gradient(130% 80% at 95% 100%, rgba(59,130,246,0.16), transparent 55%)',
      }}
    >
      {/* Blobs are anchored within the horizontal viewport bounds (no negative
          left/right); the heavy blur bleeds softly off each edge without
          extending layout/scroll width. They're large and overlap toward the
          centre so the ambient glow reads across the WHOLE viewport — not just
          the corners/empty areas. Vertical bleed is harmless (clipped). */}
      {/* top — cyan, reaches centre-top */}
      <div
        className="animate-aurora-1 absolute right-0 -top-16 h-[420px] w-[420px] rounded-full opacity-70 blur-[70px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      {/* upper-middle left — violet */}
      <div
        className="animate-aurora-2 absolute left-0 top-[16%] h-[420px] w-[420px] rounded-full opacity-65 blur-[75px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
      {/* middle right — blue */}
      <div
        className="animate-aurora-1 absolute right-0 top-[44%] h-[400px] w-[400px] rounded-full opacity-60 blur-[70px]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />
      {/* lower-middle left — cyan */}
      <div
        className="animate-aurora-2 absolute left-0 top-[68%] h-[400px] w-[400px] rounded-full opacity-58 blur-[70px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      {/* bottom — violet, anchors the base */}
      <div
        className="animate-aurora-1 absolute -bottom-16 right-0 h-[380px] w-[380px] rounded-full opacity-55 blur-[65px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
    </div>
  )
}
