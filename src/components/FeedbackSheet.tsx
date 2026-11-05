import { useEffect, useState } from 'react'
import { MessageSquarePlus, ExternalLink } from 'lucide-react'
import { Sheet } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { feedbackAvailable, listMyFeedback, submitFeedback, STATUS_LABEL } from '../lib/feedback'
import type { Feedback, FeedbackStatus } from '../lib/feedback'

// Palauteportaali: kirjoita mitä haluat muuttaa, ja näe mitä aiemmille
// palautteille on tapahtunut. Iltainen automaatio lukee nämä rivit.

const STATUS_TONE: Record<FeedbackStatus, string> = {
  new: 'text-fg-muted',
  triaged: 'text-fg-muted',
  in_progress: 'text-accent',
  needs_review: 'text-[#e8b85a]',
  shipped: 'text-[#34d399]',
  rejected: 'text-fg-ghost',
  duplicate: 'text-fg-ghost',
}

export function FeedbackButton({ lastView }: { lastView?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!feedbackAvailable() || !user) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-row border border-white/10 bg-[rgba(9,11,20,0.48)] py-3.5 font-mono text-[12px] uppercase tracking-[0.08em] text-fg-dim [backdrop-filter:blur(14px)]"
      >
        <MessageSquarePlus size={15} />
        Palaute ja toiveet
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} userId={user.id} lastView={lastView} />
    </>
  )
}

function FeedbackSheet({
  open, onClose, userId, lastView,
}: { open: boolean; onClose: () => void; userId: string; lastView?: string }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Feedback[] | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    listMyFeedback(userId).then((r) => { if (alive) setItems(r) })
    return () => { alive = false }
  }, [open, userId])

  const send = async () => {
    setBusy(true)
    setError(null)
    const r = await submitFeedback(userId, body, lastView)
    setBusy(false)
    if (!r.ok) {
      // Teksti jää kenttään — epäonnistunut lähetys ei saa hävittää kirjoitettua.
      setError(r.message)
      return
    }
    setBody('')
    setItems((prev) => [r.item, ...(prev ?? [])])
  }

  return (
    <Sheet open={open} onClose={onClose} title="Palaute">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Kerro mikä ei toimi tai mitä haluaisit muuttaa. Palautteet käsitellään iltaisin:
          pienet korjaukset julkaistaan suoraan, isommat odottavat hyväksyntää.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={lastView ? `Esim. ${lastView}-näkymässä…` : 'Mitä pitäisi muuttaa?'}
          className="w-full resize-none rounded-row border border-white/10 bg-[rgba(9,11,20,0.6)] p-3 text-[15px] text-white placeholder:text-fg-ghost focus:border-accent focus:outline-none"
        />
        {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        <button
          onClick={send}
          disabled={busy || body.trim().length < 3}
          className="rounded-row bg-accent py-3 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-black disabled:opacity-40"
        >
          {busy ? 'Lähetetään…' : 'Lähetä'}
        </button>

        {items && items.length > 0 && (
          <ul className="flex flex-col gap-2 pt-2">
            {items.map((f) => (
              <li key={f.id} className="rounded-row border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                  <span className={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</span>
                  <span className="text-fg-ghost">{f.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-fg-dim">{f.body}</p>
                {(f.resolution || f.plan) && (
                  <p className="mt-1.5 text-[12px] text-fg-muted">{f.resolution ?? f.plan}</p>
                )}
                {f.prUrl && (
                  <a href={f.prUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-accent">
                    Muutos <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
