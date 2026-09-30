import { useMemo, useState } from 'react'
import { ShieldAlert, ShieldCheck, Check, X } from 'lucide-react'
import type { Settings, WeightEntry, DailyAdjustment } from '../types'
import { addDays } from '../lib/dates'
import {
  evaluateGuard, guardSettings, guardAdjustmentDates, appendLog, isGuardAdjustment,
} from '../lib/maintenanceGuard'
import { Card, Button } from './ui'

// Ylläpidon vahti, sellaisena kuin se luetaan.
//
// Kortti asuu analyysinäkymässä eikä omassa ruudussaan tarkoituksella: se on
// arvio edistymisestä, ja niitä on tässä sovelluksessa yksi paikka. Toinen
// ruutu joka kertoo painosta voisi olla eri mieltä naapurinsa kanssa, ja
// silloin kumpaakaan ei uskota.
//
// Kortti EHDOTTAA. Hyväksyminen kirjoittaa säädöt, mutta vasta napin
// painalluksesta, ja määrää ja päiviä saa muuttaa ennen sitä — ehdotus jota ei
// voi muokata on käsky.

const DAY_LABEL = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
const cardLabel = 'mb-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted'

interface Props {
  settings: Settings
  setSettings: (s: Settings) => void
  weights: WeightEntry[]
  adjustments: DailyAdjustment[]
  todayISO: string
  onApplyRollout: (days: Array<{ date: string; kcal: number }>, sourceKey: string) => void
  onDeleteAdjustment: (id: number) => void
}

export function MaintenanceGuardCard({
  settings, setSettings, weights, adjustments, todayISO, onApplyRollout, onDeleteAdjustment,
}: Props) {
  const g = guardSettings(settings.maintenanceGuard)

  // Voimassa oleva vaje = vahdin merkitsemä säätö tästä päivästä eteenpäin.
  // Tilaa ei säilytetä erikseen: säädöt ovat totuus, ja niiden poistaminen on
  // se mitä vajeen poistaminen tarkoittaa.
  const activeGuardAdjustments = useMemo(
    () => adjustments.filter((a) => a.date >= todayISO && isGuardAdjustment(a.note)),
    [adjustments, todayISO],
  )
  const verdict = useMemo(
    () => evaluateGuard(settings.maintenanceGuard, weights, todayISO, activeGuardAdjustments.length > 0),
    [settings.maintenanceGuard, weights, todayISO, activeGuardAdjustments.length],
  )

  const latestWeek = verdict.weeks.filter((w) => w.valid).slice(-1)[0]?.start ?? null
  const dismissed = latestWeek !== null && g.dismissedThroughWeek === latestWeek

  const [kcal, setKcal] = useState(g.suggestKcalPerDay)
  const [days, setDays] = useState<number[]>(g.suggestDays)

  if (verdict.state === 'off') return null

  const logAnd = (kind: 'trigger' | 'accept' | 'dismiss' | 'exit', note: string, patch: Partial<typeof g> = {}) => {
    const next = appendLog({ ...g, ...patch }, {
      at: new Date().toISOString(),
      kind,
      note,
      anchorKg: verdict.anchorKg ?? 0,
      avgKg: verdict.latestAvgKg ?? 0,
    })
    setSettings({ ...settings, maintenanceGuard: next })
  }

  const accept = () => {
    const s = verdict.suggestion
    if (!s) return
    const perWeek = kcal * Math.max(1, days.length)
    const weeks = Math.max(1, Math.ceil((s.excessKg * 7700 * g.fatFraction) / perWeek))
    const dates = guardAdjustmentDates(addDays(todayISO, 1), days, weeks)
    onApplyRollout(dates.map((d) => ({ date: d, kcal: -kcal })), `vahti-${todayISO}`)
    logAnd(
      'accept',
      `Hyväksytty −${kcal} kcal/vrk päiville ${days.map((d) => DAY_LABEL[d]).join(', ')}, ${weeks} vk (${dates.length} päivää). Ylitys ${s.excessKg.toFixed(1)} kg.`,
    )
  }

  const dismiss = () => {
    logAnd(
      'dismiss',
      `Ohitettu. Ylitys ${(verdict.latestAvgKg ?? 0) - (verdict.anchorKg ?? 0) > 0 ? '+' : ''}${((verdict.latestAvgKg ?? 0) - (verdict.anchorKg ?? 0)).toFixed(1)} kg.`,
      { dismissedThroughWeek: latestWeek ?? undefined },
    )
  }

  const removeDeficit = () => {
    for (const a of activeGuardAdjustments) onDeleteAdjustment(a.id)
    logAnd('exit', `Vaje poistettu ${activeGuardAdjustments.length} päivältä. Keskiarvo takaisin ankkurissa.`)
  }

  // ── Vaje jo voimassa ────────────────────────────────────────────
  // Hyväksytty ehdotus ei katoa siitä että paino on yhä ylhäällä — se on
  // nimenomaan se tilanne jota vaje korjaa. Ilman tätä haaraa kortti kysyisi
  // samaa uudestaan joka avauksella, ja toinen hyväksyntä kaksinkertaistaisi
  // vajeen huomaamatta.
  if (activeGuardAdjustments.length > 0 && verdict.state !== 'exit') {
    return (
      <Card variant="glass" className="mt-2.5">
        <div className={`${cardLabel} flex items-center gap-1.5`}>
          <ShieldCheck size={13} /> Ylläpidon vahti
        </div>
        <p className="m-0 text-[12px] leading-relaxed text-fg-dim">
          Vaje on voimassa {activeGuardAdjustments.length} tulevalle päivälle. {verdict.reason}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={removeDeficit}>Poista vaje</Button>
        </div>
      </Card>
    )
  }

  // ── Laukaissut, ei ohitettu: ehdotus ────────────────────────────
  if (verdict.state === 'trigger' && verdict.suggestion && !dismissed) {
    const s = verdict.suggestion
    const perWeek = kcal * Math.max(1, days.length)
    const weeks = (s.excessKg * 7700 * g.fatFraction) / perWeek
    return (
      <Card variant="glass" className="mt-2.5 border-danger/[0.22]">
        <div className={`${cardLabel} flex items-center gap-1.5 text-danger`}>
          <ShieldAlert size={13} /> Ylläpidon vahti
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-fg-dim">{verdict.reason}</p>

        <div className="mt-3 rounded-row border border-white/[0.08] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-fg-muted">Vaje / vrk</span>
            <input
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 rounded-input border border-white/10 bg-black/[0.45] px-2 py-1.5 text-center text-[15px] tabular-nums text-text"
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[12px] text-fg-muted">Päivät</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    aria-pressed={on}
                    className={`flex h-8 w-8 !min-h-0 !min-w-0 items-center justify-center rounded-lg font-mono text-[10px] uppercase ${
                      on ? 'bg-accent/25 text-accent' : 'border border-white/10 text-fg-faint'
                    }`}
                  >
                    {DAY_LABEL[d]}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-fg-faint">
            Paluu kestää noin <strong className="text-text">{weeks.toFixed(1)} viikkoa</strong> tällä
            vajeella ({s.excessKg.toFixed(1)} kg × 7700 × {g.fatFraction}). Viikonloput pysyvät
            koskemattomina ellet lisää niitä itse.
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={accept} disabled={days.length === 0}>
            <Check size={15} /> Hyväksy
          </Button>
          <Button variant="secondary" onClick={dismiss}><X size={15} /> Ohita</Button>
        </div>
      </Card>
    )
  }

  // ── Palattu ankkuriin ───────────────────────────────────────────
  if (verdict.state === 'exit') {
    return (
      <Card variant="glass" className="mt-2.5 border-[rgba(100,200,120,0.25)]">
        <div className={`${cardLabel} flex items-center gap-1.5 text-[#7fd694]`}>
          <ShieldCheck size={13} /> Ylläpidon vahti
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-fg-dim">{verdict.reason}</p>
        <div className="mt-3">
          <Button variant="primary" onClick={removeDeficit}>
            Poista vaje ({activeGuardAdjustments.length} pv)
          </Button>
        </div>
      </Card>
    )
  }

  // ── Hiljainen tila ──────────────────────────────────────────────
  return (
    <Card variant="glass" className="mt-2.5">
      <div className={`${cardLabel} flex items-center gap-1.5`}>
        <ShieldCheck size={13} /> Ylläpidon vahti
      </div>
      <p className="m-0 text-[12px] leading-relaxed text-fg-faint">
        {dismissed ? `${verdict.reason} Ohitettu tältä viikolta.` : verdict.reason}
      </p>
      {verdict.weeks.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {verdict.weeks.slice(-4).map((w) => (
            <div key={w.start} className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
              <span className="text-fg-ghost">{w.start.slice(8, 10)}.{w.start.slice(5, 7)}.</span>
              <span className={w.valid ? 'tabular-nums text-fg-muted' : 'text-fg-ghost'}>
                {w.valid ? `${w.avgKg?.toFixed(1)} kg` : `riittämätön data (${w.weighIns})`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
