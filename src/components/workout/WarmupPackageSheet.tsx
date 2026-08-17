import { Flame, Check, TrendingUp, Activity } from 'lucide-react'
import { Sheet, Button } from '../ui'
import type { ResolvedWarmupItem } from '../../lib/warmups'

// The warm-up, as a routine rather than as training volume.
//
// It used to be two numbered slots in the exercise list, which put it on the
// same footing as weighted dips and invited logging it set by set. It is one
// package now: read it, do it, tick it. Nothing here is counted.
//
// Two things do change per session, and both are shown rather than left for the
// user to remember: the once-a-week progressive dose, and the wrist items when
// the wrist is being treated. A treating wrist is not a reason to skip wrist
// prep — it is the reason the dose goes up.

interface Props {
  items: ResolvedWarmupItem[]
  name: string
  note?: string
  done: boolean
  onToggleDone: () => void
  onClose: () => void
}

export function WarmupPackageSheet({ items, name, note, done, onToggleDone, onClose }: Props) {
  const anyEscalated = items.some((i) => i.escalated)

  return (
    <Sheet open onClose={onClose} title={<><Flame size={14} />{name}</>}>
      {anyEscalated && (
        <div className="mb-3 rounded-row border border-accent/30 bg-accent/[0.08] px-3.5 py-2.5">
          <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
            Ranneportti on hoitavalla, joten ranneliikkeet on korotettu kuntoutusannokseksi.
            Lämmittelyä ei jätetä väliin — se on tänään se hoito.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-1.5">
        {items.map((it) => (
          <div
            key={it.id}
            className={`rounded-[8px] border px-3 py-2.5 ${
              it.escalated ? 'border-accent/35 bg-accent/[0.06]' : 'border-white/[0.08]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] leading-snug text-text">{it.name}</span>
              {it.dose && (
                <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-fg-muted">
                  {it.dose}
                </span>
              )}
            </div>
            {it.note && (
              <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-fg-faint">{it.note}</p>
            )}
            {(it.escalated || it.progressive) && (
              <div className="mt-1 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                {it.escalated && <span className="flex items-center gap-1"><Activity size={10} />hoitava annos</span>}
                {it.progressive && <span className="flex items-center gap-1"><TrendingUp size={10} />progressiivinen tällä viikolla</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {note && <p className="m-0 mb-3 text-[11px] leading-relaxed text-fg-ghost">{note}</p>}

      <Button variant={done ? 'action' : 'primary'} className="w-full" onClick={() => { onToggleDone(); onClose() }}>
        <Check size={16} /> {done ? 'Merkitse tekemättömäksi' : 'Lämmittely tehty'}
      </Button>
    </Sheet>
  )
}
