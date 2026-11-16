import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { WeightEntry } from '../types'
import { toISO, formatDateShort } from '../lib/dates'
import { parsePositiveDecimal, isValidDecimalInput } from '../lib/format'
import { computeWeightTrend } from '../lib/weight'
import { analyzeBloat } from '../lib/bloat'
import { Card, Button, Field } from '../components/ui'

// Logging only. Everything that judges progress — target lines, projections,
// the TDEE check, the deficit arithmetic — moved to Analyysi, so this screen
// answers exactly two questions: what have I recorded, and which of those
// readings is the current average built from.

const cardLabel = 'mb-2.5 text-[12px] font-medium   text-muted'
const sectionLabel = 'mb-2 text-[12px] font-medium   text-muted'

interface Props {
  weights: WeightEntry[]
  onAddWeight: (w: Omit<WeightEntry, 'id'>) => void
  onDeleteWeight: (id: number) => void
  onToggleExclude: (id: number) => void
}

export function WeightView({ weights, onAddWeight, onDeleteWeight, onToggleExclude }: Props) {
  const [form, setForm] = useState({ date: toISO(new Date()), kg: '' })
  const [showAll, setShowAll] = useState(false)

  const trend = useMemo(() => computeWeightTrend(weights), [weights])
  const bloat = useMemo(() => analyzeBloat(weights, trend), [weights, trend])

  const handleAdd = () => {
    const kg = parsePositiveDecimal(form.kg)
    if (!kg || kg <= 0) return
    onAddWeight({ date: form.date, kg, excludeFromTrend: false })
    setForm({ date: toISO(new Date()), kg: '' })
  }

  const sortedWeights = [...weights].sort((a, b) => b.date.localeCompare(a.date))
  const displayedWeights = showAll ? sortedWeights : sortedWeights.slice(0, 10)

  // The latest 7 non-excluded entries — exactly what the displayed average is
  // built from, highlighted so it is never a mystery which readings move it.
  const activeAvgIds = useMemo(() => {
    const lastSeven = [...weights]
      .filter((w) => !w.excludeFromTrend)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)
    return new Set(lastSeven.map((w) => w.id))
  }, [weights])
  const activeAvgDates = useMemo(
    () => new Set(weights.filter((w) => activeAvgIds.has(w.id)).map((w) => w.date)),
    [weights, activeAvgIds],
  )

  return (
    <div className="px-4 pb-2 pt-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="font-display text-[24px] font-bold tracking-[-0.03em] text-text">Paino</div>
        <div className="mt-[3px] text-[12px]   text-muted">Kirjaukset ja keskiarvo</div>
      </div>

      {/* ── Current average ─────────────────────────────────────────── */}
      <Card variant="glass">
        <div className={cardLabel}>Liukuva keskiarvo (7 pv)</div>
        {trend.currentTrend ? (
          <div className="flex items-end justify-between">
            <div>
              <span className="num-display text-[56px] leading-none">
                {trend.currentTrend.toFixed(2).replace('.', ',')}
              </span>
              <span className="ml-1.5 text-[18px] font-normal text-muted">kg</span>
            </div>
            {trend.weeklyChange !== null && (
              <div className="pb-1 text-right">
                <div className={`text-[20px] font-bold tabular-nums tracking-[-0.025em] ${trend.weeklyChange < 0 ? 'text-accent' : 'text-danger'}`}>
                  {trend.weeklyChange > 0 ? '+' : ''}{trend.weeklyChange.toFixed(2)}
                  <span className="text-[12px] font-normal text-muted"> kg/vko</span>
                </div>
                <div className="mt-0.5 text-[12px] text-fg-ghost">14 pv:n muutos</div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1 text-[14px] leading-relaxed text-fg-ghost">
            Kirjaa vähintään 2 päivän paino<br />aloittaaksesi keskiarvon.
          </div>
        )}
        {trend.trendData.length >= 2 && (
          <MiniChart points={trend.trendData} inAvg={activeAvgDates} />
        )}
        <p className="m-0 mt-3 border-t border-white/[0.06] pt-2.5 text-[12px] leading-relaxed text-fg-ghost">
          Vertailu tavoitteeseen, ennusteet ja kulutusarvio ovat Analyysi-välilehdellä.
        </p>
      </Card>

      {/* ── Add weight form ──────────────────────────────────────────── */}
      <Card className="mt-2.5">
        <div className={cardLabel}>Kirjaa aamupaino</div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Päivä"
            type="date"
            value={form.date}
            max={toISO(new Date())}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Field
            label="Paino (kg)"
            type="text"
            inputMode="decimal"
            value={form.kg}
            onChange={(e) => {
              const v = e.target.value
              if (isValidDecimalInput(v) || v === '') setForm({ ...form, kg: v })
            }}
            placeholder="74,5"
          />
        </div>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={!form.kg}
          className="mt-1 w-full"
        >
          Tallenna
        </Button>
      </Card>

      {/* ── Weight log ───────────────────────────────────────────────── */}
      {weights.length > 0 && (
        <div className="mt-[18px]">
          <div className="mb-1 flex items-baseline justify-between">
            <div className={sectionLabel}>Kirjaukset ({weights.length})</div>
            <div className="text-[12px] text-fg-ghost">Ohita = jätä pois keskiarvosta</div>
          </div>
          <div className="list-stagger">
            {displayedWeights.map((w) => {
              const inAvg = activeAvgIds.has(w.id)
              // A reading well above its own 7-day average is a swing, not a
              // gain. Marking it here stops a heavy Sunday reading from
              // reading as a setback — the pattern itself is measured in
              // Analyysi under "Viikkorytmi ja turvotus".
              const swing = bloat.spikeDates.has(w.date) && !w.excludeFromTrend
              return (
                <div
                  key={w.id}
                  className={`flex items-center justify-between border-b border-white/[0.05] py-[11px] transition-opacity duration-200 ${w.excludeFromTrend ? 'opacity-45' : 'opacity-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex-shrink-0 rounded-sm ${inAvg ? 'w-1 h-7' : 'w-[3px] h-7'}`}
                      style={{
                        backgroundColor: w.excludeFromTrend
                          ? 'rgba(248,113,113,0.35)'
                          : inAvg
                            ? 'var(--color-accent)'
                            : 'rgba(255,255,255,0.10)',
                        boxShadow: inAvg ? '0 0 6px rgba(34,211,238,0.45)' : 'none',
                      }}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[16px] font-medium tabular-nums text-text">
                        <span>
                          {w.kg.toFixed(1).replace('.', ',')}
                          <span className="ml-1 text-[14px] font-normal text-fg-faint">kg</span>
                        </span>
                        {w.excludeFromTrend ? (
                          <span className="rounded-md bg-[#452826] px-2 py-0.5 text-[12px] font-medium text-[#ffb4ab]">Ohitettu</span>
                        ) : inAvg ? (
                          <span className="rounded-md bg-cyan/[0.16] px-2 py-0.5 text-[12px] font-medium text-[#a5f3fc]">Keskiarvossa</span>
                        ) : null}
                        {swing && (
                          <span className="rounded-md bg-violet/[0.22] px-2 py-0.5 text-[12px] font-medium text-[#ddd6fe]">Turvotuspiikki</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[14px] text-fg-ghost">{formatDateShort(w.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleExclude(w.id)}
                      className={`h-10 rounded-full border px-3.5 text-[14px] font-medium ${
                        w.excludeFromTrend
                          ? 'border-cyan/40 text-accent'
                          : 'border-white/[0.18] text-text'
                      }`}
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      {w.excludeFromTrend ? 'Palauta' : 'Ohita'}
                    </button>
                    <button
                      className="icon-btn flex h-10 w-10 items-center justify-center rounded-full text-fg-ghost"
                      onClick={() => onDeleteWeight(w.id)}
                      aria-label="Poista kirjaus"
                      style={{ minHeight: 'auto', minWidth: 'auto' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {sortedWeights.length > 10 && (
            <Button
              variant="ghost"
              onClick={() => setShowAll(!showAll)}
              className="mt-2.5 w-full text-[12px]"
            >
              {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${sortedWeights.length})`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Viimeiset 14 päivää: punnitukset pisteinä, keskiarvo viivana. Kertoo saman
// kuin lista — mitkä lukemat keskiarvo on rakennettu — mutta yhdellä
// silmäyksellä. Ei tavoitelinjaa eikä ennustetta: arviointi kuuluu Analyysiin.
function MiniChart({
  points, inAvg,
}: {
  points: Array<{ date: string; kg: number; trend: number }>
  inAvg: Set<string>
}) {
  const last = points[points.length - 1].date
  const from = addDaysISO(last, -14)
  const pts = points.filter((p) => p.date >= from)
  if (pts.length < 2) return null

  const W = 326, H = 116, pl = 34, pr = 8, pt = 8, pb = 20
  const kgs = pts.flatMap((p) => [p.kg, p.trend])
  const lo = Math.min(...kgs) - 0.3
  const hi = Math.max(...kgs) + 0.3
  const t0 = Date.parse(from), t1 = Date.parse(last)
  const X = (d: string) => pl + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr)
  const Y = (kg: number) => pt + ((hi - kg) / (hi - lo)) * (H - pt - pb)
  const f = (n: number) => n.toFixed(1)
  const dot = (p: { date: string; kg: number }) => `M${f(X(p.date))} ${f(Y(p.kg))}h0`
  const ticks = [hi - (hi - lo) * 0.15, lo + (hi - lo) * 0.15]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-[116px] w-full" role="img"
      aria-label="Viimeiset 14 päivää: punnitukset ja liukuva keskiarvo">
      <path d={ticks.map((v) => `M${pl} ${f(Y(v))}H${W - pr}`).join('')} stroke="rgba(255,255,255,0.08)" />
      <path d={pts.map((p) => `M${f(X(p.date))} ${f(Y(p.kg))}V${f(Y(p.trend))}`).join('')} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.date))} ${f(Y(p.trend))}`).join('')} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={pts.filter((p) => !inAvg.has(p.date)).map(dot).join('') || 'M0 0'} stroke="#899294" strokeWidth="7" strokeLinecap="round" />
      <path d={pts.filter((p) => inAvg.has(p.date)).map(dot).join('') || 'M0 0'} stroke="#a5f3fc" strokeWidth="7" strokeLinecap="round" />
      {ticks.map((v) => (
        <text key={v} x={pl - 4} y={f(Y(v) + 4)} textAnchor="end" fill="#b4b7c3" fontSize="12">{v.toFixed(1).replace('.', ',')}</text>
      ))}
      <text x={pl} y={H - 4} fill="#b4b7c3" fontSize="12">{formatDateShort(from)}</text>
      <text x={W - pr} y={H - 4} textAnchor="end" fill="#b4b7c3" fontSize="12">{formatDateShort(last)}</text>
    </svg>
  )
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}
