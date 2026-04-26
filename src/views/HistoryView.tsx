import { useMemo } from 'react'
import type { ComputedResult, Settings, WeightEntry } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { computeWeightTrend } from '../lib/weight'
import { ProgressBar } from '../components/ProgressBar'
import { s } from '../styles/tokens'

interface Props {
  computed: ComputedResult
  settings: Settings
  weights: WeightEntry[]
}

interface StatRowProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
  warn?: boolean
}
function StatRow({ label, value, sub, accent, warn }: StatRowProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '9px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#777' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{
        fontSize: 15,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: accent ? '#d4b85a' : warn ? '#e87a6a' : '#ebebeb',
        letterSpacing: '-0.01em',
      }}>
        {value}
      </div>
    </div>
  )
}

export function HistoryView({ computed, settings, weights }: Props) {
  const todayISO = toISO(new Date())

  const doneDays = computed.days.filter((d) => d.date < todayISO && d.consumed > 0)
  const daysLeft = computed.days.filter((d) => d.date >= todayISO).length

  const trend = useMemo(() => computeWeightTrend(weights ?? []), [weights])

  const totalDone = doneDays.reduce((sum, d) => sum + (d.actualDeficit ?? 0), 0)
  const avgDeficit = doneDays.length > 0 ? totalDone / doneDays.length : 0

  const projectedTotal = totalDone + avgDeficit * daysLeft
  const projectedKg = projectedTotal / 7700
  const projectedEndWeight = settings.startWeight - projectedKg

  const remainingDeficitNeeded = computed.totalDeficitTarget - totalDone
  const requiredAvgDeficit = daysLeft > 0 ? remainingDeficitNeeded / daysLeft : 0

  const overallPct = computed.totalDeficitTarget > 0
    ? Math.min(1, totalDone / computed.totalDeficitTarget)
    : 0

  return (
    <div style={s.content}>
      <div style={s.dateHeader}>
        <div style={s.dateMain}>Trendit</div>
        <div style={s.dateSub}>
          {formatDateShort(settings.startDate)} – {formatDateShort(settings.endDate)}
        </div>
      </div>

      {/* Hero: weight arc */}
      <div style={{
        ...s.card,
        background: 'linear-gradient(145deg, #141414 0%, #111 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={s.cardLabel}>Painotavoite</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <span style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              color: '#ebebeb',
            }}>
              {settings.startWeight}
            </span>
            <span style={{ fontSize: 16, color: '#444', margin: '0 8px' }}>→</span>
            <span style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              color: '#d4b85a',
            }}>
              {settings.targetWeight}
            </span>
            <span style={s.unit}> kg</span>
          </div>
          <div style={{
            fontSize: 13,
            color: '#d4b85a',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
          }}>
            −{computed.weightLossKg.toFixed(1)} kg
          </div>
        </div>

        {trend.currentTrend && (
          <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                Nykyinen trendi
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {trend.currentTrend.toFixed(2)}
              </span>
              <span style={{ fontSize: 12, color: '#555', marginLeft: 3 }}>kg</span>
            </div>
            {trend.weeklyChange !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                  Viikkovauhti
                </div>
                <span style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                  color: trend.weeklyChange < 0 ? '#d4b85a' : '#e87a6a',
                }}>
                  {trend.weeklyChange > 0 ? '+' : ''}{trend.weeklyChange.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, color: '#555' }}> kg/vko</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cumulative deficit progress */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Kumulatiivinen vaje</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <div>
            <span style={{
              fontSize: 26,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.025em',
            }}>
              {Math.round(totalDone).toLocaleString('fi-FI')}
            </span>
            <span style={{ fontSize: 12, color: '#555', marginLeft: 4 }}>
              / {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal
            </span>
          </div>
          <span style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#d4b85a',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}>
            {(overallPct * 100).toFixed(1)}%
          </span>
        </div>
        <ProgressBar value={overallPct} color="#d4b85a" height={6} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444', marginTop: 8 }}>
          <span>{doneDays.length} pv tehty</span>
          <span>{daysLeft} pv jäljellä</span>
        </div>
      </div>

      {doneDays.length > 0 && (
        <>
          {/* Stats card */}
          <div style={{ ...s.card, marginTop: 10 }}>
            <div style={s.cardLabel}>Luvut</div>
            <StatRow
              label="Keskim. päivävaje"
              sub={`Tavoite: ${Math.round(computed.dailyDeficitBase)} kcal/pv`}
              value={`${Math.round(avgDeficit).toLocaleString('fi-FI')} kcal/pv`}
              accent={avgDeficit >= computed.dailyDeficitBase}
              warn={avgDeficit < computed.dailyDeficitBase}
            />
            {daysLeft > 0 && Math.abs(requiredAvgDeficit - avgDeficit) > 10 && (
              <StatRow
                label="Vaadittu vaje jatkossa"
                sub="Saavuttaaksesi lopputavoitteen"
                value={`${Math.round(requiredAvgDeficit).toLocaleString('fi-FI')} kcal/pv`}
                accent
              />
            )}
            <div style={{ paddingTop: 9 }}>
              <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>Ennuste lopputulokselle</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 22,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.025em',
                }}>
                  {projectedEndWeight.toFixed(1)}
                  <span style={s.unit}> kg</span>
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: projectedEndWeight <= settings.targetWeight ? '#d4b85a' : '#e87a6a',
                }}>
                  {projectedEndWeight <= settings.targetWeight
                    ? `✓ ylitetään ${(settings.targetWeight - projectedEndWeight).toFixed(1)} kg`
                    : `× jää ${(projectedEndWeight - settings.targetWeight).toFixed(1)} kg vajaaksi`}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {doneDays.length === 0 && (
        <div style={{
          padding: '48px 0',
          textAlign: 'center',
          color: '#333',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          Kirjaa ateriat päivittäin,<br />jotta trendit ilmestyvät tähän näkymään.
        </div>
      )}
    </div>
  )
}
