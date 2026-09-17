// Tuntopalaute — yksi soittopaikka koko sovellukselle.
//
// Kaksi täysin eri rajapintaa, koska selaimet eivät sovi asiasta:
//
//   • Vibration API (`navigator.vibrate`) — Android Chrome, Firefox. Ottaa
//     vastaan kuvion millisekunteina, joten kesto ja rytmi ovat vapaasti
//     valittavissa.
//
//   • iOS Safari EI toteuta Vibration APIa lainkaan, eikä sitä ole tulossa.
//     Ainoa reitti moottoriin on `<input type="checkbox" switch>` (Safari
//     17.4+): kun kytkin kääntyy, järjestelmä soittaa oman naksautuksensa.
//     Piilotettu kytkin `head`issä ja `label.click()` on siis koko iOS-tuki.
//     Voimakkuutta ei voi valita — saatavilla on yksi naksaus — joten
//     "kuviot" ovat tällä puolella ajoitettuja naksauksia peräkkäin.
//
// Rajoitus jonka kanssa on elettävä: iOS soittaa naksauksen luotettavasti vain
// käyttäjän eleen sisällä. Painalluspalaute osuu siihen aina, mutta
// odotuksen takaa saapuva onnistuminen (verkkokutsu, kellon loppuminen) voi
// jäädä hiljaiseksi. Siksi jokainen onnistuminen on myös nähtävissä — värähdys
// on vahvistus, ei ainoa viesti.
//
// Tämä tiedosto ei koskaan heitä. Palaute on koriste; jos se ei toimi, mikään
// muu ei saa rikkoutua sen takia.

export type Haptic =
  | 'tap'      // tavallinen painallus
  | 'select'   // valinta vaihtui (välilehti, chip)
  | 'toggle'   // kytkin kääntyi
  | 'lift'     // kortti nousi raahaukseen
  | 'success'  // sarja kuitattu, treeni tallennettu
  | 'warning'  // raja ylittyi
  | 'error'    // ei onnistunut

/** Android: värähdyskuvio [päällä, tauko, päällä, …] millisekunteina. */
const VIBRATE: Record<Haptic, number | number[]> = {
  tap: 8,
  select: 11,
  toggle: 14,
  lift: 18,
  success: [14, 55, 24],
  warning: [18, 60, 18],
  error: [26, 40, 26, 40, 26],
}

/** iOS: millisekunnit joilla naksautus toistetaan. Yksi naksaus on aina
 *  samanlainen, joten ero tehdään rytmillä eikä voimakkuudella. */
const CLICKS: Record<Haptic, number[]> = {
  tap: [0],
  select: [0],
  toggle: [0],
  lift: [0],
  success: [0, 95],
  warning: [0, 75],
  error: [0, 65, 130],
}

let enabled = true

/** Kutsutaan asetuksista. Oletus on päällä; poissa ollessaan ei kosketa
 *  laitteeseen lainkaan. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

export function hapticsEnabled(): boolean {
  return enabled
}

// ── iOS: piilotettu kytkin ───────────────────────────────────────────────────

let switchLabel: HTMLLabelElement | null = null
let switchSupported: boolean | null = null

function supportsSwitch(): boolean {
  if (switchSupported !== null) return switchSupported
  try {
    const probe = document.createElement('input')
    probe.type = 'checkbox'
    // `switch` on IDL-attribuutti, joka on olemassa vasta kun selain tuntee
    // koko ominaisuuden. Attribuutin asettaminen tuntemattomaan selaimeen ei
    // tekisi mitään, joten tunnistus on juuri tämä.
    switchSupported = 'switch' in probe
  } catch {
    switchSupported = false
  }
  return switchSupported
}

function ensureSwitch(): HTMLLabelElement | null {
  if (!supportsSwitch()) return null
  if (switchLabel) return switchLabel
  try {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    // Ruudunlukija ei saa löytää tätä: se ei ole säädin vaan moottori.
    input.tabIndex = -1
    label.appendChild(input)
    document.head.appendChild(label)
    switchLabel = label
  } catch {
    switchSupported = false
    return null
  }
  return switchLabel
}

/** Rakentaa iOS-kytkimen valmiiksi ennen ensimmäistä painallusta, jotta
 *  ensimmäinen naksaus ei jää DOM-lisäyksen taakse. Turvallinen kutsua monesti. */
export function primeHaptics(): void {
  ensureSwitch()
}

// ── Soitto ───────────────────────────────────────────────────────────────────

export function haptic(kind: Haptic = 'tap'): void {
  if (!enabled) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Kutsu voi palauttaa false (esim. taustavälilehti) — se ei ole virhe.
      navigator.vibrate(VIBRATE[kind])
      return
    }
    const label = ensureSwitch()
    if (!label) return
    for (const delay of CLICKS[kind]) {
      if (delay === 0) label.click()
      else window.setTimeout(() => { try { label.click() } catch { /* ohi */ } }, delay)
    }
  } catch {
    // Palaute ei ole koskaan syy kaataa kutsujaa.
  }
}
