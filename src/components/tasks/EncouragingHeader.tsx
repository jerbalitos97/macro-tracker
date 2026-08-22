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

export function EncouragingHeader({ done, total }: Props) {
  const { title, sub } = messageFor(done, total)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = total > 0 && done === total

  return (
    <div
      className={`rounded-panel border p-5 [backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)] ${
        allDone ? 'border-border-hi bg-accent/[0.10]' : 'border-white/10 bg-[rgba(9,11,20,0.5)]'
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">
        Tehtävät · {pct}%
      </div>
      {/* key vaihtaa lohkon kun viesti vaihtuu, jolloin uusi teksti häipyy
          sisään sen sijaan että sanat vain vaihtuisivat paikoillaan. */}
      <div key={title} className="view-enter">
        <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-snug tracking-[-0.015em] text-text">
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">{sub}</p>
      </div>
      {total > 0 && (
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-cyan to-violet transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
