interface Props {
  done: number
  total: number
}

// Kodin sävy säilytetään sellaisenaan: tämä työkalu on äidille, ja sen sanamuoto
// on tarkoituksella lempeä eikä suorituskeskeinen. Fridayn muut näkymät
// arvostelevat edistymistä — tämä ei.
function messageFor(done: number, total: number): { title: string; sub: string } {
  if (total === 0) return { title: 'Ei tehtäviä tänään', sub: 'Nauti vain päivästäsi.' }
  if (done === total)
    return {
      title: 'Kaikki tehty!',
      sub: 'Nyt saa rentoutua — jokainen hetki ei tarvitse olla täynnä tekemistä.',
    }
  const pct = done / total
  if (pct >= 0.66) return { title: 'Kohta valmista', sub: `Vielä ${total - done} jäljellä. Pidä rento ote.` }
  if (pct >= 0.34) return { title: 'Hyvällä matkalla', sub: `${done}/${total} tehty. Hyvä rytmi.` }
  if (done > 0) return { title: 'Hyvä alku', sub: `${done}/${total} tehty. Yksi kerrallaan riittää.` }
  return { title: 'Tämän päivän tehtävät', sub: `${total} kappaletta — aloitetaan rauhassa.` }
}

/** Näkymän ainoa hero: tehtävätyökalun amber→violetti, iso otsikko ja
 *  päivän edistymispalkki. */
export function EncouragingHeader({ done, total }: Props) {
  const { title, sub } = messageFor(done, total)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const dateLabel = new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' })

  return (
    <section
      className="flex flex-col gap-2.5 rounded-[32px_32px_32px_12px] border border-[rgba(232,184,90,0.35)] p-[22px]"
      style={{ background: 'linear-gradient(135deg, rgba(232,184,90,0.26), rgba(167,139,250,0.24))' }}
    >
      <span className="text-[14px] leading-5 text-[#f5e6c4] first-letter:uppercase">
        {dateLabel} · <span className="font-mono">{pct} %</span>
      </span>
      {/* key vaihtaa lohkon kun viesti vaihtuu, jolloin uusi teksti häipyy
          sisään sen sijaan että sanat vain vaihtuisivat paikoillaan. */}
      <div key={title} className="view-enter flex flex-col gap-2.5">
        <h2 className="m-0 text-[26px] font-medium leading-8 text-text">{title}</h2>
        <p className="m-0 text-[15px] leading-[22px] text-[#e7e2f3]">{sub}</p>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-[5px] bg-white/[0.14]"
        role="progressbar"
        aria-label="Päivän tehtävät tehty"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-2.5 rounded-[5px] transition-[width] duration-500 ease-[cubic-bezier(.2,0,0,1)]"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #e8b85a, #a78bfa)' }}
        />
      </div>
    </section>
  )
}
