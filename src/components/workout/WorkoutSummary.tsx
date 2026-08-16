import { ChevronLeft, Trash2, Dumbbell, Pencil, Flame, Check } from 'lucide-react'
import { Card, Button } from '../ui'
import { fromISO } from '../../lib/dates'
import type { Workout, SetEntry } from '../../lib/workouts'
import type { LoggableBurn } from '../../lib/energy'

interface Props {
  workout: Workout
  onClose: () => void
  onDelete?: (id: string) => void
  onEdit?: () => void
  /** Null when the estimate cannot be made (no body weight recorded yet). */
  burn?: LoggableBurn | null
  onLogBurn?: (kcal: number) => void
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m}:${String(rem).padStart(2, '0')}` : `${m}min`
}

function fmtSet(s: SetEntry): string {
  const parts: string[] = []
  if (s.reps != null) parts.push(`${s.reps}`)
  if (s.weight != null) parts.push(`${s.weight} kg`)
  if (s.duration != null) parts.push(fmtDuration(s.duration))
  return parts.join(' · ') || '–'
}

function dateLabel(iso: string): string {
  return fromISO(iso).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function WorkoutSummary({ workout, onClose, onDelete, onEdit, burn, onLogBurn }: Props) {
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0)

  return (
    <div className="px-4 pb-10 pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label="Takaisin"
          className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-full p-1.5 text-fg-muted"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[22px] font-bold tracking-[-0.02em] text-text">{workout.name}</h1>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">
            {dateLabel(workout.date)}
          </div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label="Muokkaa treeniä"
            className="flex h-9 w-9 !min-h-0 !min-w-0 items-center justify-center rounded-full border border-white/15 bg-[rgba(9,11,20,0.50)] text-fg-muted"
          >
            <Pencil size={15} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => { if (window.confirm('Poistetaanko tämä treeni?')) { onDelete(workout.id); onClose() } }}
            aria-label="Poista treeni"
            className="icon-btn flex min-h-0 min-w-0 items-center justify-center rounded-md p-1.5 text-fg-faint hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <Card variant="panel">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Liikkeet</div>
          <div className="mt-0.5 font-display text-[24px] font-bold tabular-nums text-text">{workout.exercises.length}</div>
        </Card>
        <Card variant="panel">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">Sarjat</div>
          <div className="mt-0.5 font-display text-[24px] font-bold tabular-nums text-text">{totalSets}</div>
        </Card>
      </div>

      {/* Estimated cost of the session */}
      {burn && burn.countedSets > 0 && (
        <Card variant="glass" className="mb-3">
          <div className="mb-2 flex items-center gap-2">
            <Flame size={14} className="flex-shrink-0 text-protein" />
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">
              Arvioitu kulutus
            </span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[28px] font-bold tabular-nums tracking-[-0.02em] text-text">
              {burn.sessionKcal}
            </span>
            <span className="text-[12px] text-muted">kcal netto</span>
          </div>
          <div className="mt-0.5 text-[11px] text-fg-faint">
            {burn.countedSets} kuitattua sarjaa · {burn.workMinutes} min
            {!burn.precise && ' · lisää pituus ja syntymävuosi Perusarvoihin tarkempaa arviota varten'}
          </div>

          <div className="mt-3 rounded-[8px] border border-white/[0.07] bg-black/30 p-2.5">
            <BurnRow k="Päivän treenit yhteensä" v={`${burn.dayTotalKcal} kcal`} />
            {burn.assumedKcal > 0 && (
              <BurnRow k="Päivätyyppi kattaa jo" v={`−${burn.assumedKcal} kcal`} />
            )}
            {burn.alreadyLoggedKcal > 0 && (
              <BurnRow k="Jo kirjattu" v={`−${burn.alreadyLoggedKcal} kcal`} />
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-white/[0.07] pt-1.5 text-[12px]">
              <span className="text-muted">Kirjattavaa</span>
              <span className="tabular-nums font-semibold text-accent">{burn.loggableKcal} kcal</span>
            </div>
          </div>

          {burn.loggableKcal > 0 ? (
            onLogBurn && (
              <Button
                variant="primary"
                className="mt-3 w-full"
                onClick={() => onLogBurn(burn.loggableKcal)}
              >
                Kirjaa {burn.loggableKcal} kcal päivälle
              </Button>
            )
          ) : (
            <div className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-faint">
              <Check size={12} className="mt-0.5 flex-shrink-0 text-[#7fd694]" />
              <div>
                {burn.alreadyLoggedKcal > 0 ? (
                  <p className="m-0">
                    Tämän päivän treenit on jo kirjattu ({burn.alreadyLoggedKcal} kcal). Samaa
                    treeniä ei lasketa kahdesti.
                  </p>
                ) : (
                  <p className="m-0">
                    Päivätyyppisi olettaa treenille {burn.assumedKcal} kcal ja tämä treeni
                    arvioitiin {burn.dayTotalKcal} kcal:iin — erikseen kirjattavaa ei jää, eikä
                    samaa treeniä lasketa kahdesti.
                  </p>
                )}
                {burn.alreadyLoggedKcal === 0 && burn.assumedKcal > burn.dayTotalKcal * 1.4 && (
                  <p className="m-0 mt-1 text-fg-ghost">
                    Jos näin toistuu, päivätyyppien TDEE voi olla asetettu turhan korkeaksi.
                    Analyysin kulutusarvion tarkistus sanoo saman asian painodatasta.
                  </p>
                )}
              </div>
            </div>
          )}

          <details className="mt-2">
            <summary className="flex cursor-pointer select-none items-center gap-1 text-[10px] text-fg-ghost [list-style:none]">
              ▸ Miten arvio lasketaan
            </summary>
            <div className="mt-1.5 text-[10px] leading-[1.65] text-fg-faint">
              <p className="m-0 mb-1">
                Vain kuitatut sarjat lasketaan. Kunkin sarjan kesto arvioidaan toistoista
                (3 s / toisto, väh. 20 s) tai kirjatusta ajasta, ja jokaiseen kuormitettuun
                sarjaan lisätään 75 s palautusta — sekin on osa treenin kestoa.
              </p>
              <p className="m-0 mb-1">
                Koko kestolle lasketaan yksi teho (voimaharjoittelu 3,8 MET, liikkuvuus 2,5,
                intervalli 5,0) — juuri noin MET-arvot on julkaistu, koko treenille eikä pelkille
                sarjoille. Kulutus on <strong className="text-fg-muted">nettoa</strong>: leposyke
                on jo TDEE:ssä, joten siitä lasketaan vain ylimenevä osa, ja perustaso otetaan
                omasta arvioidusta lepokulutuksestasi (paino, pituus, ikä) eikä yleisestä
                1 kcal/kg/h -vakiosta, joka on useimmille liian korkea.
              </p>
              <p className="m-0">
                Lopuksi luvusta otetaan 15 % pois. Arvio on tarkoituksella varovainen: yliarvio
                söisi hiljaa sitä vajetta johon koko suunnitelma nojaa.
              </p>
            </div>
          </details>
        </Card>
      )}

      {/* Exercises */}
      <div className="flex flex-col gap-2.5">
        {workout.exercises.map((ex) => (
          <Card key={ex.id} variant="glass">
            <div className="mb-2 flex items-center gap-2">
              <Dumbbell size={15} className="flex-shrink-0 text-cyan" />
              <div className="min-w-0 truncate font-display text-[15px] font-semibold text-text">{ex.name}</div>
            </div>
            <div className="flex flex-col gap-1">
              {ex.sets.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between border-t border-white/[0.05] py-1 text-[13px] first:border-t-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">Sarja {i + 1}</span>
                  <span className="tabular-nums text-text">{fmtSet(s)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function BurnRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px] text-[12px]">
      <span className="text-muted">{k}</span>
      <span className="tabular-nums text-text">{v}</span>
    </div>
  )
}
