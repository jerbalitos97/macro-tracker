import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toISO } from '../../lib/dates'

interface Props {
  year: number
  /** 0 = tammikuu. */
  monthIndex0: number
  selectedISO: string
  /** Avoimien tehtävien määrä per päivä — piste solun alle. */
  openByDate: Map<string, number>
  onSelect: (iso: string) => void
  onPrev: () => void
  onNext: () => void
}

const WEEKDAYS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']
const MONTHS = [
  'tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu',
]

/** Maanantai-alkuinen viikko: JS antaa su=0, kalenteri haluaa ma=0. */
const startsOnIndex = (year: number, m0: number): number => (new Date(year, m0, 1).getDay() + 6) % 7
const daysInMonth = (year: number, m0: number): number => new Date(year, m0 + 1, 0).getDate()

export function MonthCalendar({
  year, monthIndex0, selectedISO, openByDate, onSelect, onPrev, onNext,
}: Props) {
  const startsOn = startsOnIndex(year, monthIndex0)
  const days = daysInMonth(year, monthIndex0)
  // Paikallinen tämä päivä, ei UTC — ks. lib/dates.ts.
  const todayISO = toISO(new Date())

  const cells: Array<{ day: number; iso: string } | null> = []
  for (let i = 0; i < startsOn; i++) cells.push(null)
  for (let d = 1; d <= days; d++) {
    cells.push({
      day: d,
      iso: `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-panel border border-white/10 bg-[rgba(9,11,20,0.5)] p-4 [backdrop-filter:blur(18px)_saturate(160%)] [-webkit-backdrop-filter:blur(18px)_saturate(160%)]">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Edellinen kuukausi"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/30 text-fg-muted"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="font-mono text-[11px] uppercase tracking-[0.10em] text-fg-dim">
          {MONTHS[monthIndex0]} {year}
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label="Seuraava kuukausi"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/30 text-fg-muted"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center font-mono text-[9px] uppercase tracking-[0.08em] text-fg-ghost">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} aria-hidden />
          const open = openByDate.get(c.iso) ?? 0
          const selected = c.iso === selectedISO
          const isToday = c.iso === todayISO
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onSelect(c.iso)}
              aria-label={`${c.day}. ${MONTHS[monthIndex0]}${open > 0 ? `, ${open} avointa` : ''}`}
              aria-current={selected ? 'date' : undefined}
              className={`relative flex aspect-square min-h-0 min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg border text-[13px] transition-colors ${
                selected
                  ? 'border-border-hi bg-accent/[0.16] text-text'
                  : isToday
                    ? 'border-white/15 bg-white/[0.04] text-text'
                    : 'border-transparent text-fg-muted'
              }`}
            >
              <span className={selected || isToday ? 'font-semibold' : ''}>{c.day}</span>
              {open > 0 && (
                <span
                  aria-hidden
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-violet"
                  style={{ boxShadow: '0 0 6px rgba(167,139,250,0.8)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
