import { useMemo } from 'react'
import type { ComputedResult, Settings, WeightEntry } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { computeWeightTrend } from '../lib/weight'
import { getActiveGoal } from '../lib/goalPeriods'
import { ProgressBar } from '../components/ProgressBar'
import { Card } from '../components/ui'

const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

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
    <div className="flex items-baseline justify-between border-b border-white/[0.05] py-[9px]">
      <div>
        <div className="text-[12px] text-muted">{label}</div>
        {sub && <div className="mt-0.5 text-[10px] text-fg-ghost">{sub}</div>}
      </div>
      <div className={`text-[15px] font-bold tabular-nums tracking-[-0.01em] ${accent ? 'text-accent' : warn ? 'text-danger' : 'text-text'}`}>
        {value}
      </div>
    </div>
  )
}

export function HistoryView({ computed, settings, weights }: Props) {
  const todayISO = toISO(new Date())
  // The header and the projection used to read the legacy settings fields,
  // which are frozen at the first goal ever set — so this card showed one
  // period's weights above another period's numbers.
  const goal = getActiveGoal(settings, todayISO)

  const doneDays = computed.days.filter((d) => d.date < todayISO && d.consumed > 0)
  const daysLeft = computed.days.filter((d) => d.date >= todayISO).length

  const trend = useMemo(() => computeWeightTrend(weights ?? []), [weights])

  const totalDone = doneDays.reduce((sum, d) => sum + (d.actualDeficit ?? 0), 0)
  const avgDeficit = doneDays.length > 0 ? totalDone / doneDays.length : 0
  // What the plan asked of *these* days. The period average (dailyDeficitBase)
  // is the wrong yardstick once weekendMaintenance makes the plan uneven — a
  // stretch of mostly weekdays is asked for more than the period average.
  const plannedForDoneDays =
    doneDays.length > 0
      ? doneDays.reduce((sum, d) => sum + d.dailyDeficitBase, 0) / doneDays.length
      : computed.dailyDeficitBase

  const projectedTotal = totalDone + avgDeficit * daysLeft
  const projectedKg = projectedTotal / 7700
  const projectedEndWeight = goal.startWeight - projectedKg

  const remainingDeficitNeeded = computed.totalDeficitTarget - totalDone
  const requiredAvgDeficit = daysLeft > 0 ? remainingDeficitNeeded / daysLeft : 0

  const overallPct = computed.totalDeficitTarget > 0
    ? Math.min(1, totalDone / computed.totalDeficitTarget)
    : 0

  return (
    <div className="px-4 pb-2 pt-4">
      <div className="mb-4">
        <div className="font-display text-[22px] font-bold tracking-[-0.025em] text-text">Trendit</div>
        <div className="mt-[3px] text-[11px] uppercase tracking-[0.1em] text-muted">
          {formatDateShort(goal.startDate)} – {formatDateShort(goal.endDate)}
        </div>
      </div>

      {/* Hero: weight arc */}
      <Card variant="glass">
        <div className={cardLabel}>Painotavoite</div>
        <div className="mb-1 flex items-end justify-between">
          <div>
            <span className="font-display text-[32px] font-extrabold tabular-nums tracking-[-0.03em] text-text">
              {goal.startWeight}
            </span>
            <span className="mx-2 text-[16px] text-fg-ghost">→</span>
            <span className="font-display text-[32px] font-extrabold tabular-nums tracking-[-0.03em] text-accent">
              {goal.targetWeight}
            </span>
            <span className="text-[14px] text-muted"> kg</span>
          </div>
          {/* This slot used to print computed.weightLossKg — the *planned*
              change, i.e. the same 74.2 → 73.2 restated as "−1.0 kg", which
              read like progress. Show the change actually achieved instead. */}
          {trend.currentTrend !== null && (
            <div className="text-right">
              <div className="text-[13px] font-semibold tabular-nums text-accent">
                {trend.currentTrend - goal.startWeight > 0 ? '+' : '−'}
                {Math.abs(trend.currentTrend - goal.startWeight).toFixed(1)} kg
              </div>
              <div className="text-[9px] uppercase tracking-[0.1em] text-fg-ghost">tähän asti</div>
            </div>
          )}
        </div>

        {trend.currentTrend && (
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <div>
              <div className="mb-[3px] text-[10px] uppercase tracking-[0.1em] text-fg-ghost">
                Nykyinen trendi
              </div>
              <span className="font-display text-[22px] font-bold tabular-nums tracking-[-0.02em] text-text">
                {trend.currentTrend.toFixed(2)}
              </span>
              <span className="ml-[3px] text-[12px] text-muted">kg</span>
            </div>
            {trend.weeklyChange !== null && (
              <div className="text-right">
                <div className="mb-[3px] text-[10px] uppercase tracking-[0.1em] text-fg-ghost">
                  Viikkovauhti
                </div>
                <span className={`font-display text-[18px] font-bold tabular-nums tracking-[-0.02em] ${trend.weeklyChange < 0 ? 'text-accent' : 'text-danger'}`}>
                  {trend.weeklyChange > 0 ? '+' : ''}{trend.weeklyChange.toFixed(2)}
                </span>
                <span className="text-[11px] text-muted"> kg/vko</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Cumulative deficit progress */}
      <Card className="mt-2.5">
        <div className={cardLabel}>Kumulatiivinen vaje</div>
        <div className="mb-0.5 flex items-baseline justify-between">
          <div>
            <span className="font-display text-[26px] font-extrabold tabular-nums tracking-[-0.025em] text-text">
              {Math.round(totalDone).toLocaleString('fi-FI')}
            </span>
            <span className="ml-1 text-[12px] text-muted">
              / {Math.round(computed.totalDeficitTarget).toLocaleString('fi-FI')} kcal
            </span>
          </div>
          <span className="font-display text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-accent">
            {(overallPct * 100).toFixed(1)}%
          </span>
        </div>
        <ProgressBar value={overallPct} color="#22d3ee" height={6} />
        <div className="mt-2 flex justify-between text-[10px] text-fg-ghost">
          <span>{doneDays.length} pv tehty</span>
          <span>{daysLeft} pv jäljellä</span>
        </div>
      </Card>

      {doneDays.length > 0 && (
        <Card className="mt-2.5">
          <div className={cardLabel}>Luvut</div>
          <StatRow
            label="Keskim. päivävaje"
            sub={`Tavoite näille päiville: ${Math.round(plannedForDoneDays)} kcal/pv`}
            value={`${Math.round(avgDeficit).toLocaleString('fi-FI')} kcal/pv`}
            accent={avgDeficit >= plannedForDoneDays}
            warn={avgDeficit < plannedForDoneDays}
          />
          {daysLeft > 0 && Math.abs(requiredAvgDeficit - avgDeficit) > 10 && (
            <StatRow
              label="Vaadittu vaje jatkossa"
              sub="Saavuttaaksesi lopputavoitteen"
              value={`${Math.round(requiredAvgDeficit).toLocaleString('fi-FI')} kcal/pv`}
              accent
            />
          )}
          <div className="pt-[9px]">
            <div className="mb-1 text-[12px] text-muted">Ennuste lopputulokselle</div>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[22px] font-extrabold tabular-nums tracking-[-0.025em] text-text">
                {projectedEndWeight.toFixed(1)}
                <span className="text-[14px] font-normal text-muted"> kg</span>
              </span>
              <span className={`text-[12px] font-semibold ${projectedEndWeight <= goal.targetWeight ? 'text-accent' : 'text-danger'}`}>
                {projectedEndWeight <= goal.targetWeight
                  ? `✓ ylitetään ${(goal.targetWeight - projectedEndWeight).toFixed(1)} kg`
                  : `× jää ${(projectedEndWeight - goal.targetWeight).toFixed(1)} kg vajaaksi`}
              </span>
            </div>
          </div>
        </Card>
      )}

      {doneDays.length === 0 && (
        <div className="py-12 text-center text-[13px] leading-relaxed text-fg-ghost">
          Kirjaa ateriat päivittäin,<br />jotta trendit ilmestyvät tähän näkymään.
        </div>
      )}
    </div>
  )
}
