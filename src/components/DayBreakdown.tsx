import type { ComputedDay } from '../types'

interface Props {
  day: ComputedDay
}

const row = 'flex justify-between py-[5px] text-xs'
const label = 'text-muted'
const val = 'tabular-nums text-text'

export function DayBreakdown({ day }: Props) {
  return (
    <div>
      <div className={row}>
        <span className={label}>TDEE ({day.dayType})</span>
        <span className={val}>+{day.baseTdee}</span>
      </div>
      <div className={row}>
        <span className={label}>Cut-vaje (perus)</span>
        <span className={`${val} text-white/50`}>−{day.dailyDeficitBase}</span>
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
          <span className={label}>Säätö{day.adjustment.note ? ` · ${day.adjustment.note}` : ''}</span>
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

      {/* Toteutuma — actual consumed and resulting deficit vs the planned baseline */}
      {(day.consumed > 0 || day.burnKcal > 0) && day.actualDeficit !== undefined && (
        <>
          <div className="mb-1 mt-3.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#666]">
            Toteutuma
          </div>
          <div className={row}>
            <span className={label}>Syöty</span>
            <span className={val}>
              {day.consumed.toLocaleString('fi-FI')} kcal
            </span>
          </div>
          {(() => {
            const actual = day.actualDeficit ?? 0
            const planned = day.dailyDeficitBase
            const diff = actual - planned
            const deficitColor =
              diff >= 100 ? 'text-[#8acb88]' : diff <= -100 ? 'text-danger' : 'text-accent'
            return (
              <>
                <div className={row}>
                  <span className={label}>Toteutunut vaje</span>
                  <span className={`${val} font-semibold ${deficitColor}`}>
                    {actual >= 0 ? '+' : '−'}
                    {Math.abs(Math.round(actual)).toLocaleString('fi-FI')} kcal
                  </span>
                </div>
                <div className={row}>
                  <span className={`${label} text-[#666]`}>Suunniteltu vaje</span>
                  <span className={`${val} text-[#666]`}>
                    +{planned.toLocaleString('fi-FI')} kcal
                  </span>
                </div>
                <div className={row}>
                  <span className={`${label} text-[#666]`}>Ero suunnitelmaan</span>
                  <span className={`${val} ${deficitColor}`}>
                    {diff >= 0 ? '+' : '−'}{Math.abs(Math.round(diff)).toLocaleString('fi-FI')} kcal
                  </span>
                </div>
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
