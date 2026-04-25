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

export function HistoryView({ computed, settings, weights }: Props) {
  const todayISO = toISO(new Date())

  const doneDays = computed.days.filter((d) => d.date < todayISO && d.consumed > 0)
  const daysLeft = computed.days.filter((d) => d.date >= todayISO).length

  const trend = useMemo(() => computeWeightTrend(weights ?? []), [weights])

  const totalDone = doneDays.reduce((s, d) => s + (d.actualDeficit ?? 0), 0)
  const avgDeficit = doneDays.length > 0 ? totalDone / doneDays.length : 0

  const projectedTotal = totalDone + avgDeficit * daysLeft
  const projectedKg = projectedTotal / 7700
  const projectedEndWeight = settings.startWeight - projectedKg

  const remainingDeficitNeeded = computed.totalDeficitTarget - totalDone
  const requiredAvgDeficit = daysLeft > 0 ? remainingDeficitNeeded / daysLeft : 0

  return (
    <div style={s.content}>
      <div style={s.dateHeader}>
        <div style={s.dateMain}>Cut-ajanjakso</div>
        <div style={s.dateSub}>
          {formatDateShort(settings.startDate)} – {formatDateShort(settings.endDate)}
        </div>
      </div>

      {/* Start → target */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Lähtöpaino → tavoite</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {settings.startWeight}{' '}
            <span style={{ fontSize: 13, color: '#555' }}>→</span>{' '}
            {settings.targetWeight}{' '}
            <span style={s.unit}>kg</span>
          </div>
          <div style={{ fontSize: 14, color: '#d4b85a' }}>
            −{computed.weightLossKg.toFixed(1)} kg
          </div>
        </div>
        {trend.currentTrend && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid #1f1f1f',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: '#666' }}>Nykyinen trendi: </span>
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {trend.currentTrend.toFixed(2)} kg
              </span>
            </div>
            {trend.weeklyChange !== null && (
              <div
                style={{
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: trend.weeklyChange < 0 ? '#d4b85a' : '#e87a6a',
                }}
              >
                {trend.weeklyChange > 0 ? '+' : ''}
                {trend.weeklyChange.toFixed(2)} kg/vko
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cumulative deficit */}
      <div style={{ ...s.card, marginTop: 10 }}>
        <div style={s.cardLabel}>Kumulatiivinen vaje</div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#e5e5e5',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(totalDone).toLocaleString('fi-FI')} /{' '}
          {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal
        </div>
        <ProgressBar value={totalDone / computed.totalDeficitTarget} color="#d4b85a" />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: '#666',
            marginTop: 6,
          }}
        >
          <span>{doneDays.length} pv tehty</span>
          <span>{daysLeft} pv jäljellä</span>
        </div>
      </div>

      {doneDays.length > 0 && (
        <>
          {/* Average deficit */}
          <div style={{ ...s.card, marginTop: 10 }}>
            <div style={s.cardLabel}>Keskimääräinen päivävaje</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              <span
                style={{
                  color: avgDeficit >= computed.dailyDeficitBase ? '#d4b85a' : '#e87a6a',
                }}
              >
                {Math.round(avgDeficit).toLocaleString('fi-FI')}
              </span>
              <span style={s.unit}>kcal / pv</span>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              Tavoite: {Math.round(computed.dailyDeficitBase)} kcal/pv
            </div>
          </div>

          {/* Projection */}
          <div style={{ ...s.card, marginTop: 10 }}>
            <div style={s.cardLabel}>Ennuste lopputulokselle</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e5e5e5' }}>
              {projectedEndWeight.toFixed(1)} <span style={s.unit}>kg</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: projectedEndWeight <= settings.targetWeight ? '#d4b85a' : '#e87a6a',
                marginTop: 4,
              }}
            >
              {projectedEndWeight <= settings.targetWeight
                ? `✓ tavoite ylitetään ${(settings.targetWeight - projectedEndWeight).toFixed(1)} kg`
                : `× tavoitteesta jää ${(projectedEndWeight - settings.targetWeight).toFixed(1)} kg`}
            </div>
          </div>

          {/* Required pace */}
          {daysLeft > 0 && Math.abs(requiredAvgDeficit - avgDeficit) > 10 && (
            <div style={{ ...s.card, marginTop: 10 }}>
              <div style={s.cardLabel}>Vaadittu vaje jatkossa</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d4b85a' }}>
                {Math.round(requiredAvgDeficit).toLocaleString('fi-FI')} kcal / pv
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                Saavuttaaksesi lopputavoitteen jäljellä olevilla päivillä
              </div>
            </div>
          )}
        </>
      )}

      {doneDays.length === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>
          Kirjaa ateriat päivittäin, jotta trendit ilmestyvät tähän näkymään.
        </div>
      )}
    </div>
  )
}
