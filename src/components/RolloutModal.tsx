import { useMemo, useState } from 'react'
import { Sliders } from 'lucide-react'
import { Sheet, Chip, Button } from './ui'
import { planRollout } from '../lib/compensation'
import { formatDateShort } from '../lib/dates'

// Applying a suggestion used to mean reading "200 kcal/pv for 12 days" off a
// card and then typing twelve daily adjustments by hand. This is that, as one
// button — with the two knobs that actually matter kept adjustable, because
// the suggested figure is a starting point rather than a prescription: how
// much of the gap to take on, and over how long to spread it.

const SHARES = [0.5, 0.75, 1] as const
const SPREADS = [
  { factor: 2 / 3, label: 'Lyhyempi', hint: 'tiukempi' },
  { factor: 1, label: 'Suositeltu', hint: '' },
  { factor: 1.5, label: 'Pidempi', hint: 'loivempi' },
] as const

interface Props {
  title: string
  /** What the suggestion is settling, in a sentence. */
  description: string
  /** Signed. Negative tightens future days, positive loosens them. */
  totalKcal: number
  /** Days the suggestion proposes spreading over. */
  suggestedDays: number
  /** Rollout starts the day after this — normally today. */
  fromDate: string
  /** Never place an adjustment past this (the goal period's end). */
  lastDate: string
  onApply: (days: Array<{ date: string; kcal: number }>) => void
  onClose: () => void
}

export function RolloutModal({
  title,
  description,
  totalKcal,
  suggestedDays,
  fromDate,
  lastDate,
  onApply,
  onClose,
}: Props) {
  const [share, setShare] = useState<number>(1)
  const [spread, setSpread] = useState<number>(1)

  const plan = useMemo(() => {
    const amount = Math.round(totalKcal * share)
    const days = Math.max(1, Math.round(suggestedDays * spread))
    return planRollout(amount, days, fromDate, lastDate)
  }, [totalKcal, share, suggestedDays, spread, fromDate, lastDate])

  const applied = plan.reduce((s, d) => s + d.kcal, 0)
  const perDay = plan.length > 0 ? Math.round(applied / plan.length) : 0
  const tighten = totalKcal < 0
  // The period can end before the chosen spread does; say so rather than
  // silently applying less than the preview implies.
  const wantedDays = Math.max(1, Math.round(suggestedDays * spread))
  const truncated = plan.length > 0 && plan.length < wantedDays

  return (
    <Sheet open onClose={onClose} title={<><Sliders size={14} />{title}</>}>
      <p className="mb-3.5 text-xs leading-[1.55] text-fg-muted">{description}</p>

      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        Kuinka suuri osa
      </div>
      <div className="mb-3.5 grid grid-cols-3 gap-1.5">
        {SHARES.map((s) => (
          <Chip
            key={s}
            active={share === s}
            onClick={() => setShare(s)}
            className="justify-center tabular-nums"
          >
            {Math.round(s * 100)} %
          </Chip>
        ))}
      </div>

      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        Miten pitkälle jaetaan
      </div>
      <div className="mb-3.5 grid grid-cols-3 gap-1.5">
        {SPREADS.map((s) => (
          <Chip
            key={s.label}
            active={spread === s.factor}
            onClick={() => setSpread(s.factor)}
            className="flex-col justify-center gap-0 py-1.5 text-center leading-tight"
          >
            <span>{s.label}</span>
            {s.hint && <span className="text-[9px] text-fg-ghost">{s.hint}</span>}
          </Chip>
        ))}
      </div>

      {plan.length === 0 ? (
        <div className="rounded-[10px] border border-danger/20 bg-danger/[0.06] px-3.5 py-3 text-[12px] text-danger">
          Jakson loppuun ei mahdu enää päiviä, joille säätö voitaisiin jakaa.
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/[0.08] bg-black/30 px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted">
              {tighten ? 'Tiukennus' : 'Löysäys'} per päivä
            </span>
            <span className={`text-[17px] font-bold tabular-nums ${tighten ? 'text-accent' : 'text-protein'}`}>
              {perDay > 0 ? '+' : ''}{perDay} kcal
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-[11px] text-fg-faint">
            <span>{plan.length} päivää</span>
            <span>
              {formatDateShort(plan[0].date)} – {formatDateShort(plan[plan.length - 1].date)}
            </span>
          </div>
          <div className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[11px] text-fg-faint">
            Yhteensä {applied > 0 ? '+' : ''}{applied.toLocaleString('fi-FI')} kcal
            {share < 1 && (
              <span className="text-fg-ghost">
                {' '}({Math.round(share * 100)} % koko erosta {Math.abs(totalKcal).toLocaleString('fi-FI')} kcal)
              </span>
            )}
          </div>
          {truncated && (
            <div className="mt-1.5 text-[11px] text-danger">
              Jakso päättyy ennen kuin {wantedDays} päivää täyttyy — säätö mahtuu {plan.length} päivälle.
            </div>
          )}
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={plan.length === 0}
          onClick={() => onApply(plan)}
        >
          Jalkauta
        </Button>
        <Button variant="ghost" onClick={onClose}>Peru</Button>
      </div>
    </Sheet>
  )
}
