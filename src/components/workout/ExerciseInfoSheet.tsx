import { Info, Ban, CornerDownRight } from 'lucide-react'
import { Sheet } from '../ui'
import type { EnvRequirement, LoggedExercise, Prescription, TemplateExercise } from '../../lib/workouts'
import { GATE_LABEL, REGION_LABEL } from '../../lib/gates'
import { CAPABILITY_LABEL } from '../../lib/locations'
import { pickedVariant } from '../../lib/sessionResolve'
import type { VariantKey } from '../../lib/sessionResolve'

// What the template actually says about this one movement.
//
// The logger shows the finished answer — "3 × 6–8, tempo 3-0-X" — because that
// is what you need with a bar in your hands. But the template says more than
// the answer: the note explaining what the set is for, the equipment ladder
// behind the substitution, and what the other gate states would have
// prescribed. All of it was invisible once the session was resolved, which made
// the written instructions dead weight: written once, never read again.
//
// So this sheet shows the resolved prescription first, then why it was chosen,
// then the slot as written. Reading top to bottom answers "what am I doing",
// "why this and not the heavy version", and "what does the plan actually say".

const label = 'mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-fg-dim'
const box = 'mb-3 rounded-row border border-white/[0.08] bg-[rgba(9,11,20,0.45)] px-3.5 py-3'

const VARIANT_ORDER: VariantKey[] = ['develop', 'hybrid', 'treat', 'rest']

function repsLabel(p: Prescription): string | undefined {
  if (p.reps == null) return undefined
  return typeof p.reps === 'number' ? `${p.reps}` : `${p.reps.min}–${p.reps.max}`
}

/** "3 × 6–8" or "5 × 10 s" — the dose, without the name. */
function dose(p: Prescription): string {
  const reps = repsLabel(p)
  if (reps) return `${p.sets} × ${reps}`
  if (p.holdSeconds != null) return `${p.sets} × ${p.holdSeconds} s`
  return `${p.sets} × –`
}

function caps(requires: EnvRequirement['requires']): string {
  return requires.map((c) => CAPABILITY_LABEL[c]).join(' + ')
}

/** The equipment ladder, drawn as the chain it is. Each rung says what the room
 *  must provide and what happens when it does not, down to the rung that needs
 *  nothing — or to the point where the slot is simply dropped. */
function EnvChain({ env, depth = 0 }: { env: EnvRequirement; depth?: number }) {
  const fb = env.fallback
  return (
    <div className={depth > 0 ? 'mt-1 border-l border-white/[0.10] pl-2.5' : ''}>
      <div className="text-[11px] leading-snug text-fg-muted">
        <span className="text-fg-faint">Vaatii: </span>
        <span className="text-text">{caps(env.requires)}</span>
      </div>
      {fb === null ? (
        <div className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-fg-faint">
          <Ban size={11} className="mt-0.5 flex-shrink-0" />
          Jos ei ole: liike jää pois, ei korvaajaa
        </div>
      ) : (
        <>
          <div className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug">
            <CornerDownRight size={11} className="mt-0.5 flex-shrink-0 text-fg-faint" />
            <span>
              <span className="text-text">{fb.name}</span>
              <span className="ml-1 font-mono tabular-nums text-fg-muted">{dose(fb)}</span>
              {fb.tempo && <span className="ml-1 font-mono text-fg-faint">{fb.tempo}</span>}
              {fb.note && <span className="block text-fg-faint">{fb.note}</span>}
            </span>
          </div>
          {fb.env && <EnvChain env={fb.env} depth={depth + 1} />}
        </>
      )}
    </div>
  )
}

interface Props {
  exercise: LoggedExercise
  /** The slot this came from, when the template still has it. */
  slot: TemplateExercise | null
  /** The template's own note — the block-level instruction, shown once. */
  templateNote?: string
  onClose: () => void
}

export function ExerciseInfoSheet({ exercise: ex, slot, templateNote, onClose }: Props) {
  const r = ex.resolution
  const todayKey = slot?.gate && r?.gateState ? pickedVariant(slot.gate, r.gateState) : null

  return (
    <Sheet open onClose={onClose} title={<><Info size={14} />Ohje</>}>
      {/* ── What you are actually doing ── */}
      <div className={label}>Tänään</div>
      <div className={box}>
        <div className="font-display text-[15px] font-semibold leading-tight text-text">{ex.name}</div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-fg-muted">
          {ex.interval
            ? `${ex.interval.workSeconds} s työ / ${ex.interval.restSeconds} s lepo × ${ex.interval.rounds}`
            : `${ex.sets.length} ${ex.sets.length === 1 ? 'sarja' : 'sarjaa'}`}
          {ex.tempo && <span className="ml-2 text-fg-faint">tempo {ex.tempo}</span>}
        </div>
        {ex.note && (
          <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-fg-muted">{ex.note}</p>
        )}
        {r?.unavailable && (
          <p className="m-0 mt-1.5 flex items-start gap-1 text-[12px] leading-relaxed text-fg-faint">
            <Ban size={12} className="mt-0.5 flex-shrink-0" />
            {r.unavailable === 'env'
              ? 'Ei mahdollinen tässä paikassa — liikettä ei korvattu.'
              : 'Jätetty pois tänään päiväarvion perusteella.'}
          </p>
        )}
      </div>

      {/* ── Why this and not something else ── */}
      {r && (r.gateRegion || r.envFallback || r.source === 'manual') && (
        <>
          <div className={label}>Miksi tämä</div>
          <div className={box}>
            {r.gateRegion && (
              <div className="text-[12px] leading-relaxed text-fg-muted">
                <span className="text-text">{REGION_LABEL[r.gateRegion]}portti</span>
                {' → '}
                <span className="text-accent">{GATE_LABEL[r.gateState ?? 'develop']}</span>
                <span className="text-fg-faint">
                  {r.source === 'asked' ? ' · kysytty tänään' : r.source === 'manual' ? ' · vaihdettu käsin' : ' · pääteltiin lokista'}
                </span>
              </div>
            )}
            {r.envFallback && (
              <div className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                Paikka vaihtoi liikkeen: pohjan ensisijainen versio vaatii varusteen jota täällä ei
                ole.
              </div>
            )}
            {r.baseName && r.baseName !== ex.name && (
              <div className="mt-1 text-[12px] leading-relaxed text-fg-faint">
                Pohjan slotti: {r.baseName}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── The slot as written ── */}
      {slot ? (
        <>
          <div className={label}>Pohjassa</div>
          <div className={box}>
            <div className="font-display text-[14px] font-semibold leading-tight text-text">
              {slot.name}
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-fg-muted">
              {dose({
                name: slot.name,
                sets: slot.defaultSets,
                reps: slot.repRange,
                holdSeconds: slot.defaultDuration,
              })}
              {slot.tempo && <span className="ml-2 text-fg-faint">tempo {slot.tempo}</span>}
            </div>
            {slot.note && (
              <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-fg-muted">{slot.note}</p>
            )}

            {slot.env && (
              <div className="mt-2.5 border-t border-white/[0.07] pt-2.5">
                <div className={label}>Paikkavaatimus</div>
                <EnvChain env={slot.env} />
              </div>
            )}

            {slot.gate && (
              <div className="mt-2.5 border-t border-white/[0.07] pt-2.5">
                <div className={label}>{REGION_LABEL[slot.gate.bodyRegion]}portin variantit</div>
                {VARIANT_ORDER.filter((k) => k in slot.gate!.variants).map((key) => {
                  const v = slot.gate!.variants[key]
                  const isToday = key === todayKey
                  return (
                    <div
                      key={key}
                      className={`mb-1.5 rounded-[8px] border px-2.5 py-2 ${
                        isToday ? 'border-accent/40 bg-accent/[0.08]' : 'border-white/[0.07]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${isToday ? 'text-accent' : 'text-fg-faint'}`}>
                          {GATE_LABEL[key]}
                        </span>
                        {isToday && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                            tänään
                          </span>
                        )}
                      </div>
                      {v == null ? (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-faint">
                          <Ban size={11} /> Liike jätetään pois tässä tilassa
                        </div>
                      ) : (
                        <>
                          <div className="mt-0.5 text-[12px] leading-snug text-text">
                            {v.name}
                            <span className="ml-1.5 font-mono tabular-nums text-fg-muted">{dose(v)}</span>
                            {v.tempo && <span className="ml-1.5 font-mono text-fg-faint">{v.tempo}</span>}
                          </div>
                          {v.note && (
                            <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-fg-faint">{v.note}</p>
                          )}
                          {v.env && (
                            <div className="mt-1.5">
                              <EnvChain env={v.env} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
                <p className="m-0 text-[10px] leading-snug text-fg-ghost">
                  Määrittelemätön tila putoaa lähimpään määriteltyyn.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="m-0 mb-3 text-[11px] leading-relaxed text-fg-ghost">
          {ex.resolution
            ? 'Pohjan slottia ei löytynyt — pohjaa on muokattu tai se on arkistoitu sen jälkeen kun tämä treeni kirjattiin. Yllä on se mitä sessioon tallennettiin.'
            : 'Tämä liike lisättiin käsin, joten pohjassa ei ole sille ohjetta.'}
        </p>
      )}

      {templateNote && (
        <>
          <div className={label}>Pohjan yleisohje</div>
          <p className="m-0 mb-3 text-[12px] leading-relaxed text-fg-muted">{templateNote}</p>
        </>
      )}
    </Sheet>
  )
}
