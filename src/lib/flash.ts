// Onnistumisen välähdys — `.flash` päälle hetkeksi, sitten pois.
//
// Imperatiivinen tarkoituksella. Välähdys ei ole tila vaan tapahtuma: se ei
// kuulu Reactin tilaan sen enempää kuin äänimerkki kuuluisi. Tilana se olisi
// pitänyt myös nollata, ja jokainen uusi kuittaus olisi vaatinut oman
// ajastimensa komponentin sisään.
//
// Kohde etsitään ylöspäin `[data-flash]`iin asti, joten napin klikkaus saa
// välähtämään koko rivin ilman että riviin tarvitsee pujottaa refiä läpi
// raahauskomponentin.

import { haptic } from './haptics'

/** Sama kuin `.flash`-animaation kesto globaalissa CSS:ssä. */
export const FLASH_MS = 560

const CLASS = 'flash'

export function flashEl(el: Element | null | undefined, tint?: string): void {
  if (!el || !(el instanceof HTMLElement)) return
  try {
    if (tint) el.style.setProperty('--flash', tint)
    // Luokan poisto + pakotettu uudelleenlayout on se mikä käynnistää
    // animaation uudestaan silloinkin kun edellinen on vielä kesken —
    // pelkkä uudelleenlisäys samalla framella ei tekisi mitään.
    el.classList.remove(CLASS)
    void el.offsetWidth
    el.classList.add(CLASS)

    const prev = Number(el.dataset.flashTimer ?? 0)
    if (prev) window.clearTimeout(prev)
    // Ajastin eikä `animationend`: liikkeen poisto -tilassa animaatiota ei ole
    // eikä tapahtumaa tulisi koskaan, ja luokka jäisi päälle ikuisesti.
    const timer = window.setTimeout(() => {
      el.classList.remove(CLASS)
      delete el.dataset.flashTimer
    }, FLASH_MS + 40)
    el.dataset.flashTimer = String(timer)
  } catch {
    // Koriste.
  }
}

/** Välähdyttää lähimmän `[data-flash]`-esi-isän, tai annetun elementin itsensä
 *  jos merkittyä esi-isää ei ole. */
export function flashFrom(node: Element | null | undefined, tint?: string): void {
  if (!node || typeof node.closest !== 'function') return
  flashEl(node.closest('[data-flash]') ?? node, tint)
}

/** Kuittaus kokonaisuudessaan: värähdys ja välähdys samasta kutsusta.
 *
 *  Yhdessä eikä erikseen, koska ne ovat sama viesti kahdelle aistille. Erillään
 *  ne olisivat ehtineet jo eriytyä — jossain vain värähdys, jossain vain
 *  välähdys — ja palaute olisi ollut epäjohdonmukaista ruudusta toiseen. */
export function celebrate(node: Element | null | undefined, tint?: string): void {
  haptic('success')
  flashFrom(node, tint)
}
