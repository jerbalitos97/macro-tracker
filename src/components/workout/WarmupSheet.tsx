import { useState } from 'react'
import { Flame } from 'lucide-react'
import { Sheet } from '../ui'

interface WarmupMove {
  name: string
  detail?: string
  dose: string
}

const MOVES: WarmupMove[] = [
  {
    name: 'Rotaatiokombo',
    detail: 'polvillaan olkapääkierto + askelkyykky-kierrot + ATG-kyykkykierto — rintaranka, lonkat, takaketju, syvyys',
    dose: '2×/puoli ×3',
  },
  {
    name: 'Rannerutiini',
    detail: 'quadruped rocks + sormet taakse painonsiirto + rystypito',
    dose: '60–90s',
  },
  {
    name: 'Lapakierto',
    detail: 'scap push up + scap pull up / lapaveto',
    dose: '8 + 8',
  },
  {
    name: 'Kuminauha ulko- + sisäkierto',
    dose: '10 + 10',
  },
  {
    name: 'Ramppisarja',
    detail: 'päivän 1. liike: 2 kevennettyä sarjaa progressio alas (tuck ennen straddlea, pogo hopit ennen depth jumppeja)',
    dose: '2 sarjaa',
  },
]

/** Floating warm-up button + routine sheet, shown on every workout screen. */
export function WarmupFab() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Lämmittely"
        className="active:scale-95 fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-accent transition-transform [backdrop-filter:blur(14px)] [box-shadow:0_8px_24px_rgba(0,0,0,0.45)]"
      >
        <Flame size={20} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={<><Flame size={14} /> Lämppä · 5 liikettä, ei skipata</>}
      >
        <p className="mb-4 text-[12px] leading-relaxed text-fg-muted">
          Kiireessä pudotusjärjestys: 4 pois ensin — 2 ja 5 ei ikinä.
        </p>
        <ol className="flex flex-col gap-2.5">
          {MOVES.map((mv, i) => (
            <li key={mv.name} className="rounded-row border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-fg-faint">{i + 1}</span>
                <span className="font-display text-[14px] font-semibold text-text">{mv.name}</span>
              </div>
              {mv.detail && (
                <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{mv.detail}</p>
              )}
              <div className="mt-1.5 font-mono text-[11px] text-accent">{mv.dose}</div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] leading-relaxed text-fg-faint">
          Korvaa erillisen aktivoinnin — ramppisarja on spesifein mahdollinen lämmittely.
        </p>
      </Sheet>
    </>
  )
}
