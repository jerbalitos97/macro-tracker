// Painalluspalaute koko sovellukselle yhdestä paikasta.
//
// Vaihtoehto olisi ollut käydä läpi joka nappi ja lisätä sinne onPointerDown.
// Niitä on yli sata, ja jokainen uusi nappi unohtuisi. Delegoitu kuuntelija
// juuressa hoitaa kaikki kerralla: mikä tahansa `button`, `[role="button"]`
// tai `.pressable` saa saman värähdyksen ja saman kosketuskehän ilman että
// komponentti tietää asiasta mitään.
//
// Palaute tulee `pointerdown`ista eikä klikkauksesta. Se on tahallista: sormen
// alla tapahtuva vahvistus on se mikä saa painalluksen tuntumaan laitteelta
// eikä verkkosivulta, ja odottaminen `click`iin asti tuo sen aina liian
// myöhään. Hinta on että kortilta alkava vieritys värähtää turhaan — 8 ms, ja
// vaihtokauppa on sama minkä natiivit sovellukset tekevät.

import { haptic, primeHaptics } from './haptics'
import type { Haptic } from './haptics'

/** Mikä lasketaan painettavaksi. `[data-haptic]` kertoo halutessaan lajin. */
const PRESSABLE = 'button, [role="button"], [role="tab"], a[href], summary, .pressable, [data-haptic]'

/** Kosketuskehän elinikä. Lyhyt: se on kuittaus, ei animaatio. */
const BLOOM_MS = 420

let installed = false

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Pehmeä hehku sormen alle. Kiinnitetään `body`yn eikä painettuun elementtiin,
 *  koska useimmilla korteilla on `overflow: hidden` tai oma taustasuodatin —
 *  sisälle laitettuna kehä leikkautuisi tai jäisi lasin taakse. */
function bloom(x: number, y: number, tint: string): void {
  if (reducedMotion()) return
  try {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y}px`,
      'width:150px',
      'height:150px',
      'margin:-75px 0 0 -75px',
      'border-radius:9999px',
      `background:radial-gradient(circle, ${tint} 0%, transparent 68%)`,
      'pointer-events:none',
      'z-index:2147483000',
      'will-change:transform,opacity',
    ].join(';')
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'scale(0.28)', opacity: 0.9 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration: BLOOM_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
    const cleanup = () => el.remove()
    anim.addEventListener('finish', cleanup)
    anim.addEventListener('cancel', cleanup)
    // Jos WAAPI ei pyöri (taustavälilehti), roska siivotaan silti.
    window.setTimeout(cleanup, BLOOM_MS + 400)
  } catch {
    // Koriste. Ei koskaan syy kaatua.
  }
}

/** Painetun elementin oma sävy, jos se on annettu — muuten sovelluksen syaani. */
function tintOf(el: Element): string {
  const named = (el as HTMLElement).dataset?.pressTint
  if (named) return named
  return 'rgba(125, 211, 252, 0.34)'
}

function kindOf(el: Element): Haptic {
  const named = (el as HTMLElement).dataset?.haptic
  if (named === 'select' || named === 'toggle' || named === 'success' ||
      named === 'warning' || named === 'error' || named === 'lift' || named === 'tap') {
    return named
  }
  if (el.getAttribute('role') === 'tab') return 'select'
  return 'tap'
}

function onPointerDown(e: PointerEvent): void {
  if (!e.isPrimary) return
  const target = e.target as Element | null
  if (!target || typeof target.closest !== 'function') return

  const el = target.closest(PRESSABLE)
  if (!el) return
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return
  // Tekstikenttä nappulan sisällä (harvinaista, mutta esiintyy riveissä) on
  // kirjoittamista, ei painallusta.
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  if (el.closest('[data-no-haptic]')) return

  haptic(kindOf(el))
  bloom(e.clientX, e.clientY, tintOf(el))
}

/** Kutsutaan kerran käynnistyksessä. */
export function installPressFeedback(): void {
  if (installed || typeof document === 'undefined') return
  installed = true

  document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })

  // iOS Safari ei sovella `:active`-tyylejä lainkaan ellei dokumentilla ole
  // kosketuskuuntelijaa. Tyhjä passiivinen kuuntelija on se kytkin — ilman
  // tätä koko painallusanimaatio jäisi pois juuri siltä laitteelta jolle se on
  // tehty. Pointer-tapahtumat eivät kelpaa tähän, sen on oltava `touchstart`.
  document.addEventListener('touchstart', () => {}, { passive: true })

  // Ensimmäinen ele rakentaa iOS:n kytkimen valmiiksi. Ennen elettä sitä ei
  // kannata tehdä, koska silloin se ei kuitenkaan soisi.
  const prime = () => {
    primeHaptics()
    document.removeEventListener('pointerdown', prime, true)
  }
  document.addEventListener('pointerdown', prime, { passive: true, capture: true })
}
