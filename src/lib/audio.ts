// Short tones for the clocks.
//
// One AudioContext for the whole app. Browsers cap how many a page may create,
// and each one holds an audio hardware handle open; the interval timer and the
// rest alarm both want a beep, so they share.
//
// iOS will not let a context make sound until it has been created or resumed
// inside a user gesture. Every clock here starts from a tap, so `primeAudio`
// is called from that handler — after which the timer can beep on its own
// schedule, including when it fires a second later with no gesture in sight.

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // no audio on this device, or blocked; callers carry on silently
  }
}

/** Unlock audio from inside a user gesture. Safe to call repeatedly. */
export function primeAudio(): void {
  context()
}

export function beep(freq: number, ms = 160, gain = 0.25): void {
  const c = context()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.frequency.value = freq
    osc.connect(g)
    g.connect(c.destination)
    g.gain.setValueAtTime(gain, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + ms / 1000)
    osc.start()
    osc.stop(c.currentTime + ms / 1000)
  } catch {
    // a failed beep is never worth breaking a timer over
  }
}
