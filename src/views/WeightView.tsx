import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { WeightEntry, Meal, Settings } from '../types'
import { toISO, addDays, formatDateShort, daysBetween } from '../lib/dates'
import { parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { computeWeightTrend, estimateTdeeAdjustment } from '../lib/weight'
import { WeightChart } from '../components/WeightChart'
import { ProgressBar } from '../components/ProgressBar'
import { s } from '../styles/tokens'

interface Props {
  weights: WeightEntry[]
  onAddWeight: (w: Omit<WeightEntry, 'id'>) => void
  onDeleteWeight: (id: number) => void
  onToggleExclude: (id: number) => void
  settings: Settings
  meals: Meal[]
}

export function WeightView({
  weights,
  onAddWeight,
  onDeleteWeight,
  onToggleExclude,
  settings,
  meals,
}: Props) {
  const [form, setForm] = useState({ date: toISO(new Date()), kg: '' })
  const [showAll, setShowAll] = useState(false)

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const tdeeEval = useMemo(
    () => estimateTdeeAdjustment(weights, meals, settings),
    [weights, meals, settings]
  )

  const handleAdd = () => {
    const kg = parsePositiveDecimal(form.kg)
    if (!kg || kg <= 0) return
    onAddWeight({ date: form.date, kg, excludeFromTrend: false })
    setForm({ date: toISO(new Date()), kg: '' })
  }

  const sortedWeights = [...weights].sort((a, b) => b.date.localeCompare(a.date))
  const displayedWeights = showAll ? sortedWeights : sortedWeights.slice(0, 10)

  const projectedDate = useMemo(() => {
    if (!trend.currentTrend || !trend.weeklyChange || trend.weeklyChange >= 0) return null
    const kgToLose = trend.currentTrend - settings.targetWeight
    if (kgToLose <= 0) return 'saavutettu'
    const weeksNeeded = kgToLose / Math.abs(trend.weeklyChange)
    return addDays(toISO(new Date()), Math.round(weeksNeeded * 7))
  }, [trend, settings.targetWeight])

  const targetWeeklyRate = (
    ((settings.startWeight - settings.targetWeight) /
      (daysBetween(settings.startDate, settings.endDate) + 1)) * 7
  ).toFixed(2)

  return (
    <div style={s.content}>
      <div style={s.dateHeader}>
        <div style={s.dateMain}>Paino</div>
        <div style={s.dateSub}>7 pv liukuva trendi</div>
      </div>

      {/* Trend card */}
      <div style={{ ...s.card, background: 'linear-gradient(145deg, #141414 0%, #111 100%)' }}>
        <div style={s.cardLabel}>Liukuva keskiarvo (7 pv)</div>
        {trend.currentTrend ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <span style={{
                  fontSize: 42,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  color: '#ebebeb',
                }}>
                  {trend.currentTrend.toFixed(2)}
                </span>
                <span style={{ ...s.unit, marginLeft: 4 }}>kg</span>
              </div>
              {trend.weeklyChange !== null && (
                <div style={{ textAlign: 'right', paddingBottom: 4 }}>
                  <div style={{
                    fontSize: 20,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.025em',
                    color: trend.weeklyChange < 0 ? '#d4b85a' : '#e87a6a',
                  }}>
                    {trend.weeklyChange > 0 ? '+' : ''}{trend.weeklyChange.toFixed(2)}
                    <span style={{ fontSize: 11, color: '#555', fontWeight: 400 }}> kg/vko</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                    tavoite −{targetWeeklyRate} kg/vko
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#444', lineHeight: 1.5, marginTop: 4 }}>
            Kirjaa vähintään 2 päivän paino<br />aloittaaksesi trendin.
          </div>
        )}
      </div>

      {/* Add weight form */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Kirjaa aamupaino</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={s.inputLabel}>Päivä</label>
            <input
              type="date"
              value={form.date}
              max={toISO(new Date())}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.inputLabel}>Paino (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.kg}
              onChange={(e) => {
                const v = e.target.value
                if (isValidDecimalInput(v) || v === '') setForm({ ...form, kg: v })
              }}
              style={s.input}
              placeholder="74,5"
            />
          </div>
        </div>
        <button
          onClick={handleAdd}
          disabled={!form.kg}
          style={{ ...s.primaryBtn, width: '100%', marginTop: 4, opacity: form.kg ? 1 : 0.4 }}
        >
          Tallenna
        </button>
      </div>

      {/* TDEE evaluation */}
      {tdeeEval && (
        <div style={{
          ...s.card, marginTop: 10,
          backgroundColor: tdeeEval.ready && tdeeEval.significantError ? '#1a1a0e' : '#111',
          border: tdeeEval.ready && tdeeEval.significantError ? '1px solid #3a3a1a' : '1px solid #1f1f1f',
        }}>
          <div style={s.cardLabel}>TDEE-arviointi</div>
          {!tdeeEval.ready ? (
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{tdeeEval.message}</div>
          ) : tdeeEval.significantError ? (
            <>
              <div style={{ fontSize: 13, color: '#d4b85a', marginBottom: 10, lineHeight: 1.5 }}>
                Trendi ei vastaa TDEE-arvioita. Suositus:{' '}
                {tdeeEval.direction === 'lower' ? 'laske' : 'nosta'} TDEE:tä noin{' '}
                <strong>{Math.abs(Math.round(tdeeEval.tdeeError))} kcal</strong> kaikissa päivätyypeissä.
              </div>
              <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                Implikoitu vaje (paino): {Math.round(tdeeEval.trendImpliedDailyDeficit)} kcal/pv<br />
                Oletettu vaje (TDEE): {Math.round(tdeeEval.assumedDailyDeficit)} kcal/pv<br />
                Ero: {tdeeEval.tdeeError > 0 ? '+' : ''}{Math.round(tdeeEval.tdeeError)} kcal/pv
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#d4b85a' }}>
              ✓ TDEE-arvio matchää painotrendin kanssa (ero alle 100 kcal/pv).
            </div>
          )}
        </div>
      )}

      {/* Projection */}
      {projectedDate && projectedDate !== 'saavutettu' && (
        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>Ennuste tavoitteeseen ({settings.targetWeight} kg)</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDateShort(projectedDate)}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
            Cut-jakson loppu: {formatDateShort(settings.endDate)}
            {projectedDate <= settings.endDate
              ? <span style={{ color: '#d4b85a', marginLeft: 8 }}>✓ ehditään</span>
              : <span style={{ color: '#e87a6a', marginLeft: 8 }}>× ei ehditä nykyisellä tempolla</span>
            }
          </div>
        </div>
      )}

      {/* Chart */}
      {trend.trendData.length >= 3 && (
        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>Trendi</div>
          <WeightChart trendData={trend.trendData} settings={settings} />
        </div>
      )}

      {/* Progress bar to target */}
      {trend.currentTrend && (
        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>Matka tavoitteeseen</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
            <span>{settings.startWeight} kg</span>
            <span>{settings.targetWeight} kg</span>
          </div>
          <ProgressBar
            value={(settings.startWeight - trend.currentTrend) / (settings.startWeight - settings.targetWeight)}
            color="#d4b85a"
            height={6}
          />
        </div>
      )}

      {/* Weight log */}
      {weights.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={s.sectionLabel}>Kirjaukset ({weights.length})</div>
          <div className="list-stagger">
            {displayedWeights.map((w) => (
              <div
                key={w.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  opacity: w.excludeFromTrend ? 0.45 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 3, height: 28, borderRadius: 2,
                    backgroundColor: w.excludeFromTrend
                      ? 'rgba(232,122,106,0.35)'
                      : 'rgba(212,184,90,0.35)',
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{
                      fontSize: 15,
                      fontWeight: 650,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.01em',
                      color: '#ebebeb',
                    }}>
                      {w.kg.toFixed(1)}
                      <span style={{ fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 4 }}>kg</span>
                      {w.excludeFromTrend && (
                        <span style={{ fontSize: 9, color: '#e87a6a', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          ohitettu
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{formatDateShort(w.date)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    onClick={() => onToggleExclude(w.id)}
                    style={{
                      ...s.ghostBtn,
                      padding: '6px 10px',
                      fontSize: 10,
                      borderRadius: 7,
                      color: w.excludeFromTrend ? '#d4b85a' : '#444',
                      borderColor: w.excludeFromTrend ? 'rgba(212,184,90,0.3)' : 'rgba(255,255,255,0.06)',
                      minHeight: 'auto',
                      minWidth: 'auto',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {w.excludeFromTrend ? '+ trendi' : '− trendi'}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => onDeleteWeight(w.id)}
                    style={{ ...s.iconBtn, color: '#333' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {sortedWeights.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              style={{ ...s.ghostBtn, width: '100%', marginTop: 10, fontSize: 11 }}
            >
              {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${sortedWeights.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
