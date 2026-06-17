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
        // Base glow floor so no region is ever flat ink — spans top→bottom so
        // cards everywhere look like glass hovering over the aurora.
        backgroundColor: '#05060c',
        backgroundImage:
          'radial-gradient(115% 70% at 82% -5%, rgba(34,211,238,0.22), transparent 60%),' +
          'radial-gradient(110% 65% at 2% 30%,  rgba(167,139,250,0.20), transparent 60%),' +
          'radial-gradient(115% 70% at 100% 64%, rgba(59,130,246,0.22), transparent 60%),' +
          'radial-gradient(120% 70% at 25% 104%, rgba(34,211,238,0.20), transparent 60%)',
      }}
    >
      {/* Blobs are anchored within the horizontal viewport bounds (no negative
          left/right); the heavy blur bleeds softly off each edge without
          extending layout/scroll width. They're large and overlap toward the
          centre so the ambient glow reads across the WHOLE viewport — not just
          the corners/empty areas. Vertical bleed is harmless (clipped). */}
      {/* Five blobs evenly spaced top→bottom (alternating sides/colors) so the
          glow is uniform — every card hovers over visible aurora, not just the
          lower half. */}
      {/* top — cyan */}
      <div
        className="animate-aurora-1 absolute right-0 -top-[6%] h-[380px] w-[380px] rounded-full opacity-60 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      {/* upper-middle — violet */}
      <div
        className="animate-aurora-2 absolute left-0 top-[18%] h-[380px] w-[380px] rounded-full opacity-58 blur-[64px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
      {/* middle — blue */}
      <div
        className="animate-aurora-1 absolute right-0 top-[40%] h-[380px] w-[380px] rounded-full opacity-55 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />
      {/* lower-middle — cyan */}
      <div
        className="animate-aurora-2 absolute left-0 top-[62%] h-[380px] w-[380px] rounded-full opacity-55 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      {/* bottom — violet */}
      <div
        className="animate-aurora-1 absolute right-0 top-[84%] h-[380px] w-[380px] rounded-full opacity-52 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
    </div>
  )
}
