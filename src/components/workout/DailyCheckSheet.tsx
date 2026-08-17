import { useMemo, useState } from 'react'
import { MapPin, Plus, AlertTriangle, Check, SlidersHorizontal } from 'lucide-react'
import { Sheet, Button, Chip } from '../ui'
import {
  ALL_REGIONS, REGION_LABEL, REGION_QUESTION, RED_FLAG_LABEL, GATE_LABEL,
  runAllGates, clampScore,
} from '../../lib/gates'
import type { BodyRegion, DayCheck, GateStates, RedFlag, RegionHistory } from '../../lib/gates'
import {
  CAPABILITIES, CAPABILITY_LABEL, FIELD_OF, getLocations, newLocation, saveLocation,
} from '../../lib/locations'
import type { TrainingLocation } from '../../lib/locations'

// The screen between "start a session" and the session itself.
//
// It is built around one number: how many taps a normal day costs. The answer
// has to be one, or the check becomes something to skip, and a check that gets
// skipped is worse than no check because the log then lies about the days it
// was skipped on. So:
//
//   · The location is a chip row with the last one pre-selected — one tap, and
//     usually the tap you were going to make anyway to start.
//   · Body questions appear only when the log itself raises a flag. On a quiet
//     day there is a single yes/no, and "yes" starts the session.
//   · Everything is still editable on demand, so the quick path never becomes
//     a trap: "Muokkaa päiväarviota" opens every region regardless.

const label = 'mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'

interface Props {
  histories: Record<BodyRegion, RegionHistory>
  locations?: TrainingLocation[]
  defaultLocationId: string | null
  /** Open every region immediately — used by "Muokkaa päiväarviota". */
  expandAll?: boolean
  /** A place created here is content like any other, so the owner of the list
   *  gets told and can push it to the database. */
  onLocationSaved?: (saved: TrainingLocation, all: TrainingLocation[]) => void
  onCancel: () => void
  onStart: (result: {
    location: TrainingLocation | null
    check: DayCheck
    gates: GateStates
  }) => void
}

export function DailyCheckSheet({
  histories,
  locations: locationsProp,
  defaultLocationId,
  expandAll = false,
  onLocationSaved,
  onCancel,
  onStart,
}: Props) {
  const [locations, setLocations] = useState<TrainingLocation[]>(() => locationsProp ?? getLocations())
  const [locationId, setLocationId] = useState<string | null>(
    defaultLocationId ?? locations[0]?.id ?? null,
  )
  const [draftLocation, setDraftLocation] = useState<TrainingLocation | null>(null)

  const flagged = useMemo(() => ALL_REGIONS.filter((r) => histories[r].flagged), [histories])
  const [expanded, setExpanded] = useState(expandAll || flagged.length > 0)
  const [askAll, setAskAll] = useState(expandAll)
  const [scores, setScores] = useState<Partial<Record<BodyRegion, number>>>({})
  const [redFlags, setRedFlags] = useState<RedFlag[]>([])

  const location = locations.find((l) => l.id === locationId) ?? null
  const shown = askAll ? ALL_REGIONS : flagged

  const preview = useMemo(
    () => runAllGates({ scores, redFlags, source: 'asked' }, histories),
    [scores, redFlags, histories],
  )

  const start = (check: DayCheck) =>
    onStart({ location, check, gates: runAllGates(check, histories) })

  const toggleFlag = (f: RedFlag) =>
    setRedFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))

  const escalating = redFlags.length > 0

  return (
    <Sheet open onClose={onCancel} title={<><MapPin size={14} />Päiväarvio</>}>
      {/* ── Location ── */}
      <div className={label}>Missä treenaat?</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {locations.map((l) => (
          <Chip key={l.id} active={l.id === locationId} onClick={() => setLocationId(l.id)}>
            {l.name}
          </Chip>
        ))}
        <Chip onClick={() => setDraftLocation(newLocation())}>
          <Plus size={12} /> Uusi paikka
        </Chip>
      </div>

      {draftLocation && (
        <div className="mb-3 rounded-row border border-white/10 bg-[rgba(9,11,20,0.45)] p-3">
          <input
            value={draftLocation.name}
            onChange={(e) => setDraftLocation({ ...draftLocation, name: e.target.value })}
            placeholder="Paikan nimi"
            autoFocus
            className="mb-2 w-full rounded-input border border-white/10 bg-black/[0.45] px-3 py-2 text-sm text-text"
          />
          {CAPABILITIES.map((cap) => {
            const field = FIELD_OF[cap]
            const on = draftLocation[field] === true
            return (
              <button
                key={cap}
                onClick={() => setDraftLocation({ ...draftLocation, [field]: !on })}
                aria-pressed={on}
                className={`mb-1 flex w-full items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-[12px] !min-h-0 ${
                  on ? 'border-accent/40 bg-accent/[0.10] text-text' : 'border-white/10 text-fg-muted'
                }`}
              >
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border ${on ? 'border-accent bg-accent/30' : 'border-white/20'}`}>
                  {on && <Check size={10} />}
                </span>
                {CAPABILITY_LABEL[cap]}
              </button>
            )
          })}
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={!draftLocation.name.trim()}
              onClick={() => {
                const saved = { ...draftLocation, name: draftLocation.name.trim() }
                const all = saveLocation(saved)
                setLocations(all)
                setLocationId(saved.id)
                setDraftLocation(null)
                onLocationSaved?.(saved, all)
              }}
            >
              Tallenna paikka
            </Button>
            <Button variant="ghost" onClick={() => setDraftLocation(null)}>Peru</Button>
          </div>
        </div>
      )}

      {/* ── Red flags: always visible, never a score ── */}
      <div className={label}>Punaiset liput</div>
      <div className="mb-3 flex flex-col gap-1.5">
        {(Object.keys(RED_FLAG_LABEL) as RedFlag[]).map((f) => {
          const on = redFlags.includes(f)
          return (
            <button
              key={f}
              onClick={() => toggleFlag(f)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-[8px] border px-3 py-2.5 text-left text-[12px] !min-h-0 ${
                on ? 'border-danger/45 bg-danger/[0.10] text-danger' : 'border-white/10 text-fg-muted'
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border ${on ? 'border-danger bg-danger/30' : 'border-white/20'}`}>
                {on && <Check size={10} />}
              </span>
              {RED_FLAG_LABEL[f]}
            </button>
          )
        })}
      </div>

      {escalating && (
        <div className="mb-3 rounded-row border border-danger/30 bg-danger/[0.08] px-3.5 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-danger" />
            <div>
              <p className="m-0 text-[13px] font-bold text-danger">Varaa aika ammattilaiselle</p>
              <p className="m-0 mt-1 text-[11px] leading-relaxed text-fg-muted">
                Säteily jalkaan tai ranteen pettäminen kuormalla ei ole kuormanhallinnan asia,
                joten sovellus ei säädä treeniä sen ympäri. Voit aloittaa session karsitulla
                listalla: kyseisen alueen kuormittavat liikkeet jätetään pois.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── The quick path ── */}
      {!expanded && flagged.length === 0 && (
        <>
          <div className={label}>Kaikki ok tänään?</div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              onClick={() => start({ scores: {}, redFlags, source: 'inferred' })}
            >
              <Check size={15} /> Kyllä
            </Button>
            <Button variant="ghost" onClick={() => { setExpanded(true); setAskAll(true) }}>
              Ei
            </Button>
          </div>
          <p className="m-0 mb-3 text-[10px] leading-relaxed text-fg-ghost">
            Lokissa ei ole mitään mikä pyytäisi kysymään tänään. "Kyllä" tarkoittaa kaikki alueet
            kehittävälle ja treeni alkaa heti.
          </p>
        </>
      )}

      {/* ── Region questions ── */}
      {(expanded || flagged.length > 0) && (
        <>
          {shown.map((region) => {
            const h = histories[region]
            const score = scores[region]
            return (
              <div key={region} className="mb-3">
                <div className={label}>
                  {REGION_LABEL[region]}
                  {h.flagged && <span className="ml-2 text-accent">liputtaa</span>}
                </div>
                <p className="m-0 mb-2 text-[11px] leading-snug text-fg-muted">
                  {REGION_QUESTION[region]}
                </p>
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      key={n}
                      onClick={() => setScores((p) => ({ ...p, [region]: n }))}
                      aria-pressed={score === n}
                      className={`rounded-[6px] border py-2 text-center font-mono text-[11px] tabular-nums !min-h-0 !min-w-0 ${
                        score === n
                          ? 'border-accent/50 bg-accent/[0.16] text-text'
                          : 'border-white/10 text-fg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[10px] text-fg-ghost">
                  <span>
                    {h.baseline != null ? `perustaso ${h.baseline}` : 'ei vertailutasoa vielä'}
                    {h.trend7d !== 'unknown' && ` · trendi ${h.trend7d === 'rising' ? 'nouseva' : h.trend7d === 'falling' ? 'laskeva' : 'vakaa'}`}
                  </span>
                  <span className={score != null || h.flagged ? 'text-accent' : ''}>
                    → {GATE_LABEL[preview[region].state]}
                  </span>
                </div>
              </div>
            )
          })}

          {!askAll && (
            <Button variant="ghost" className="mb-3 w-full text-[11px]" onClick={() => setAskAll(true)}>
              <SlidersHorizontal size={13} /> Muokkaa päiväarviota
            </Button>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            start({
              scores,
              redFlags,
              source: Object.keys(scores).length > 0 ? 'asked' : 'inferred',
            })
          }
        >
          Aloita treeni
        </Button>
        <Button variant="ghost" onClick={onCancel}>Peru</Button>
      </div>

      {!expanded && flagged.length === 0 && (
        <button
          onClick={() => { setExpanded(true); setAskAll(true) }}
          className="mt-2 w-full text-center text-[11px] text-fg-ghost"
        >
          Muokkaa päiväarviota
        </button>
      )}
    </Sheet>
  )
}

export { clampScore }
