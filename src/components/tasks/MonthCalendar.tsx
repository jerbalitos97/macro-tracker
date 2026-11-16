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
    <div className="flex flex-col gap-2.5 rounded-panel border border-white/[0.08] bg-[var(--surface-1)] p-4">
      <div className="flex items-center gap-1">
        <span className="flex-1 pl-1 text-[16px] font-medium leading-6 text-text first-letter:uppercase">
          {MONTHS[monthIndex0]} {year}
        </span>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Edellinen kuukausi"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-transparent text-text"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Seuraava kuukausi"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-transparent text-text"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[12px] leading-4 text-fg-muted">
            {w}
          </div>
        ))}
      </div>

      {/* key kuukaudesta: kuukauden vaihto häivyttää uuden ruudukon sisään
          sen sijaan että numerot vain hyppäisivät paikoilleen. */}
      <div key={`${year}-${monthIndex0}`} className="view-enter grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} aria-hidden />
          const open = openByDate.get(c.iso) ?? 0
          const selected = c.iso === selectedISO
          const isToday = c.iso === todayISO
          // Rästipäivän piste lämmin, tulevien cyaani — sama erottelu kuin
          // listan "Aiemmilta päiviltä" -ryhmässä.
          const dot = selected ? '#05060c' : c.iso < todayISO ? '#F2D29B' : '#22d3ee'
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onSelect(c.iso)}
              aria-label={`${c.day}. ${MONTHS[monthIndex0]}${open > 0 ? `, ${open} avointa` : ''}`}
              aria-current={selected ? 'date' : undefined}
              className={`flex min-h-12 min-w-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[14px] text-[14px] transition-colors ${
                selected
                  ? 'bg-gradient-to-br from-cyan to-violet font-semibold text-bg'
                  : 'bg-[var(--surface-2)] text-text'
              } ${isToday && !selected ? 'outline-2 -outline-offset-2 outline-cyan [outline-style:solid]' : ''}`}
            >
              <span className="font-mono">{c.day}</span>
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: open > 0 ? dot : 'transparent' }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
