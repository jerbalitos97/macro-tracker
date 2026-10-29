import { cueTonesOn, voiceCuesOn } from './uiPrefs'

// Short tones for the clocks, and the spoken cues that go with them.
//
// One AudioContext for the whole app. Browsers cap how many a page may create,
// and each one holds an audio hardware handle open; the interval timer and the
// rest alarm both want a beep, so they share.
//
// iOS will not let a context make sound until it has been created or resumed
// inside a user gesture. Every clock here starts from a tap, so `primeAudio`
// is called from that handler — after which the timer can beep on its own
// schedule, including when it fires a second later with no gesture in sight.

// Safarin Audio Session API (iOS 16.4+). Ei ole TypeScriptin lib.dom:issa,
// joten tyyppi kuvataan tässä. Muut selaimet jättävät tämän huomiotta.
interface AudioSessionLike {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
}

let ctx: AudioContext | null = null
let sessionSet = false

/**
 * Kerro selaimelle millaista ääntä tämä sivu tekee.
 *
 * Ilman tätä iOS olettaa 'auto', ja käytännössä sivun ääni ottaa äänilaitteen
 * haltuun — Spotify pysähtyy kun intervallikello piippaa ensimmäisen kerran.
 * 'transient' on sama luokka jota navigaattorit käyttävät: taustaääni vaimenee
 * merkkiäänen ajaksi ja palaa itsestään, eikä mikään pysähdy.
 *
 * Tämä koskee tämän AudioContextin ääniä. Puhesynteesi on iOS:llä oma
 * äänisessionsa eikä sivu hallitse sitä — siksi puheelle on oma katkaisin.
 */
function configureSession(): void {
  if (sessionSet) return
  sessionSet = true
  try {
    const s = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
    if (s) s.type = 'transient'
  } catch {
    // vanha selain: ei sessiota säädettäväksi, äänet toimivat ennallaan
  }
}

function context(): AudioContext | null {
  try {
    configureSession()
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
  if (!cueTonesOn()) return
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

/**
 * Puhuttu vihje treenin aikana.
 *
 * Asuu täällä eikä kutsupaikassa, jotta yksi paikka päättää lähteekö ääntä.
 * Kun tämä oli komponentin sisällä, jokainen uusi kutsupaikka olisi ollut uusi
 * tilaisuus unohtaa asetus.
 *
 * `cancel()` ennen puhetta on tahallinen: vaiheet vaihtuvat nopeammin kuin
 * lause ehtii loppuun, ja jonoon jäänyt "Lepo" kuuluisi vasta seuraavan
 * supistuksen päällä. Uusin vihje on aina se joka pitää paikkansa.
 */
export function speak(text: string): void {
  if (!voiceCuesOn()) return
  try {
    configureSession()
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fi-FI'
    u.rate = 1.1
    speechSynthesis.speak(u)
  } catch {
    // ei puhetta tällä laitteella
  }
}

/** Vaientaa keskenjääneen vihjeen heti, esim. kun kello pysäytetään. */
export function stopSpeech(): void {
  try {
    speechSynthesis.cancel()
  } catch {
    // ei puhetta tällä laitteella
  }
}
