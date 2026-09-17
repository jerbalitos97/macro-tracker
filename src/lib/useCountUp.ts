import { useEffect, useRef, useState } from 'react'

// Numero ei hyppää uuteen arvoon vaan juoksee siihen.
//
// Syy ei ole koriste: ruudun iso luku muuttuu kun jotain kirjataan, ja hyppy
// jättää käyttäjän arvaamaan kumpaan suuntaan se meni. Juoksu näyttää suunnan
// ja suuruusluokan ilman että mitään tarvitsee lukea.
//
// Vain muutos animoituu. Ensimmäinen piirto näyttää oikean arvon heti, koska
// näkymän avaaminen ei ole tapahtuma jota pitäisi juhlia — ja jokaisen
// välilehden vaihdon jälkeen alusta juokseva luku olisi kikka, ei palaute.

/** Nopeampi kuin animaatiot yleensä: luku on tietoa, ja tieto saa odottaa
 *  korkeintaan hetken. */
const DEFAULT_MS = 480

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function useCountUp(value: number, ms: number = DEFAULT_MS): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = from.current
    if (start === value) return

    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Iso hyppy (esim. jakson vaihto) ei kuulu juostavaksi — se ei ole sama
    // luku kasvamassa vaan eri luku. Raja on tarkoituksella karkea.
    const jump = Math.abs(value - start) > 20000

    if (reduce || jump) {
      from.current = value
      setShown(value)
      return
    }

    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const v = start + (value - start) * easeOut(p)
      // Lähtöarvo seuraa näytettyä joka framella. Se on se mikä tekee
      // keskeytyksestä siistin: kesken juoksun saapuva uusi arvo lähtee siitä
      // mihin luku ehti, eikä nykäise takaisin edelliseen lähtöpisteeseen.
      // Refiin eikä tilaan, koska tila tässä efektin riippuvuutena käynnistäisi
      // sen uudelleen joka framella.
      from.current = v
      setShown(v)
      if (p < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        from.current = value
        raf.current = null
      }
    }
    raf.current = requestAnimationFrame(tick)

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [value, ms])

  return shown
}
