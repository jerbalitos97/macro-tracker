import type { ComputedDay } from '../types'
import { stripTags } from '../lib/compensation'

interface Props {
  day: ComputedDay
}

const row = 'flex items-baseline justify-between gap-2 py-[5px] text-xs'
const label = 'min-w-0 truncate text-muted'
const val = 'flex-shrink-0 tabular-nums text-text'

export function DayBreakdown({ day }: Props) {
  return (
    <div>
      <div className={row}>
        <span className={label}>TDEE ({day.dayType})</span>
        <span className={val}>+{day.baseTdee}</span>
      </div>
      <div className={row}>
        <span className={label}>Cut-vaje (perus)</span>
        <span className={`${val} text-fg-muted`}>−{day.dailyDeficitBase}</span>
      </div>
      {day.preBufferReduction > 0 && (
        <div className={row}>
          <span className={label}>Pre-buffer</span>
          <span className={`${val} text-danger`}>−{day.preBufferReduction}</span>
        </div>
      )}
      {day.extraKcal > 0 && (
        <div className={row}>
          <span className={label}>Ekstratreeni</span>
          <span className={`${val} text-protein`}>+{day.extraKcal}</span>
        </div>
      )}
      {day.events.map((e) => (
        <div key={e.id} className={row}>
          <span className={label}>Juhla · {e.name}</span>
          <span className={`${val} text-accent`}>+{e.excessKcal}</span>
        </div>
      ))}
      {day.adjustment && day.adjustment.kcal !== 0 && (
        <div className={row}>
          <span className={label}>Säätö{stripTags(day.adjustment.note) ? ` · ${stripTags(day.adjustment.note)}` : ''}</span>
          <span className={`${val} ${day.adjustment.kcal > 0 ? 'text-protein' : 'text-danger'}`}>
            {day.adjustment.kcal > 0 ? '+' : '−'}{Math.abs(day.adjustment.kcal)}
          </span>
        </div>
      )}
      {day.burnKcal > 0 && (
        <div className={row}>
          <span className={label}>Treenikulutus</span>
          <span className={`${val} text-protein`}>+{day.burnKcal}</span>
        </div>
      )}
      <div className={`${row} mt-1.5 border-t border-white/[0.1] pt-2`}>
        <span className={`${label} font-semibold text-text`}>Budjetti</span>
        <span className={`${val} text-[15px] font-bold text-accent`}>
          {(day.budget + day.burnKcal).toLocaleString('fi-FI')} kcal
        </span>
      </div>

      {/* Toteutuma.
          The old version printed three signed numbers — "Toteutunut vaje
          +1 879", "Suunniteltu vaje +1 500", "Ero suunnitelmaan +379" — in a
          convention where a deficit counts as positive. That reads backwards
          to anyone who has just eaten: a plus sign next to a number of
          calories looks like food, not like a shortfall. So the answer comes
          first, in words, against the budget this day actually had. */}
      {(day.consumed > 0 || day.burnKcal > 0) && (
        <>
          <div className="mb-1 mt-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
            Toteutuma
          </div>
          {(() => {
            const allowed = day.budget + day.burnKcal
            const left = Math.round(allowed - day.consumed)
            const under = left >= 0
            const pct = allowed > 0 ? Math.min(1, day.consumed / allowed) : 0
            const tone = under ? 'text-[#7fd694]' : 'text-danger'
            return (
              <>
                <div className={row}>
                  <span className={label}>Syöty</span>
                  <span className={val}>
                    {day.consumed.toLocaleString('fi-FI')} / {allowed.toLocaleString('fi-FI')} kcal
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-white/[0.07]">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${pct * 100}%`,
                      backgroundColor: under ? '#7fd694' : '#f87171',
                    }}
                  />
                </div>
                <div className={`${row} mt-1.5 border-t border-white/[0.1] pt-2`}>
                  <span className={`${label} font-semibold text-text`}>
                    {under ? 'Budjetin alle' : 'Budjetin yli'}
                  </span>
                  <span className={`flex-shrink-0 tabular-nums text-[15px] font-bold ${tone}`}>
                    {Math.abs(left).toLocaleString('fi-FI')} kcal
                  </span>
                </div>
                {/* The budget already nets out training and any manual
                    adjustment, so say so rather than leaving the reader to
                    wonder whether their session counted. */}
                {(day.burnKcal > 0 || (day.adjustment && day.adjustment.kcal !== 0)) && (
                  <p className="m-0 mt-1 text-[10px] leading-snug text-fg-ghost">
                    Budjetissa mukana
                    {day.burnKcal > 0 && ` treenikulutus +${day.burnKcal.toLocaleString('fi-FI')}`}
                    {day.burnKcal > 0 && day.adjustment && day.adjustment.kcal !== 0 && ' ja'}
                    {day.adjustment && day.adjustment.kcal !== 0 &&
                      ` säätö ${day.adjustment.kcal > 0 ? '+' : '−'}${Math.abs(day.adjustment.kcal).toLocaleString('fi-FI')}`}
                    .
                  </p>
                )}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
