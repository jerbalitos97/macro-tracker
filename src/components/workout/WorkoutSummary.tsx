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
    <div className="flex flex-col gap-3 px-4 pb-10 pt-2">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          onClick={onClose}
          aria-label="Takaisin"
          className="icon-btn flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-text"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-medium leading-7 text-text">{workout.name}</h2>
          <div className="text-[14px] leading-5 text-fg-muted">
            {dateLabel(workout.date)}
          </div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            aria-label="Muokkaa treeniä"
            className="icon-btn flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-text"
          >
            <Pencil size={20} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => { onDelete(workout.id); onClose() }}
            aria-label="Poista treeni"
            className="icon-btn flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[#FFB4AB]"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card variant="panel" className="!p-4">
          <div className="text-[12px] leading-4 text-fg-muted">Liikkeet</div>
          <div className="mt-0.5 font-mono text-[32px] font-light tabular-nums text-text">{workout.exercises.length}</div>
        </Card>
        <Card variant="panel" className="!p-4">
          <div className="text-[12px] leading-4 text-fg-muted">Sarjat</div>
          <div className="mt-0.5 font-mono text-[32px] font-light tabular-nums text-text">{totalSets}</div>
        </Card>
      </div>

      {/* Estimated cost of the session */}
      {burn && burn.countedSets > 0 && (
        <Card variant="panel" className="!p-4">
          <div className="mb-2 flex items-center gap-2">
            <Flame size={14} className="flex-shrink-0 text-protein" />
            <span className="text-[12px] leading-4 text-fg-muted">
              Arvioitu kulutus
            </span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[32px] font-light tabular-nums text-text">
              {burn.sessionKcal}
            </span>
            <span className="text-[14px] text-fg-muted">kcal netto</span>
          </div>
          <div className="mt-0.5 text-[14px] leading-5 text-fg-muted">
            {burn.countedSets} kuitattua sarjaa · {burn.workMinutes} min
            {!burn.precise && ' · lisää pituus ja syntymävuosi Perusarvoihin tarkempaa arviota varten'}
          </div>

          <div className="mt-3 rounded-[16px] bg-[var(--surface-2)] px-3 py-2">
            <BurnRow k="Päivän treenit yhteensä" v={`${burn.dayTotalKcal} kcal`} />
            {burn.assumedKcal > 0 && (
              <BurnRow k="Päivätyyppi kattaa jo" v={`−${burn.assumedKcal} kcal`} />
            )}
            {burn.alreadyLoggedKcal > 0 && (
              <BurnRow k="Jo kirjattu" v={`−${burn.alreadyLoggedKcal} kcal`} />
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-white/[0.08] pt-1.5 text-[15px] font-semibold">
              <span className="text-text">Kirjattavaa</span>
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
            <div className="mt-2.5 flex items-start gap-1.5 text-[14px] leading-5 text-fg-muted">
              <Check size={14} className="mt-0.5 flex-shrink-0 text-[#7fd694]" />
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
                  <p className="m-0 mt-1 text-fg-muted">
                    Jos näin toistuu, päivätyyppien TDEE voi olla asetettu turhan korkeaksi.
                    Analyysin kulutusarvion tarkistus sanoo saman asian painodatasta.
                  </p>
                )}
              </div>
            </div>
          )}

          <details className="mt-2">
            <summary className="flex min-h-10 cursor-pointer select-none items-center gap-1 text-[14px] font-semibold text-cyan [list-style:none]">
              ▸ Miten arvio lasketaan
            </summary>
            <div className="mt-1.5 text-[14px] leading-5 text-fg-muted">
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
          <Card key={ex.id} variant="panel" className="!p-4">
            <div className="mb-2 flex items-center gap-2">
              <Dumbbell size={15} className="flex-shrink-0 text-cyan" />
              <div className="min-w-0 truncate text-[16px] font-medium leading-6 text-text">{ex.name}</div>
            </div>
            <div className="flex flex-col gap-1">
              {ex.sets.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between border-t border-white/[0.05] py-1 text-[14px] first:border-t-0">
                  <span className="text-[14px] text-fg-muted">Sarja {i + 1}</span>
                  <span className="font-mono tabular-nums text-text">{fmtSet(s)}</span>
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
    <div className="flex items-baseline justify-between gap-2 py-[3px] text-[14px]">
      <span className="text-fg-muted">{k}</span>
      <span className="tabular-nums text-text">{v}</span>
    </div>
  )
}
