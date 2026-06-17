/**
 * Aurora Glass ambient background — drifting cyan/violet/blue blobs over the
 * ink canvas. Rendered as a real, fixed DOM layer behind all content (z-0) so
 * the glass cards' `backdrop-filter: blur(...)` can sample it. Decorative only;
 * the drift animations self-disable under prefers-reduced-motion (see global.css).
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg"
    >
      <div
        className="animate-aurora-1 absolute -left-24 top-16 h-[340px] w-[340px] rounded-full opacity-50 blur-[50px]"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 70%)' }}
      />
      <div
        className="animate-aurora-2 absolute -right-28 top-[clamp(220px,40vh,420px)] h-[360px] w-[360px] rounded-full opacity-45 blur-[60px]"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
      />
      <div
        className="animate-aurora-1 absolute -bottom-24 left-8 h-[300px] w-[300px] rounded-full opacity-40 blur-[55px]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />
    </div>
  )
}
