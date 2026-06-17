import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { getSettings, updateSettings } from '../lib/wealth/settings'
import { formatMoney } from '../lib/wealth/format'
import { Card, Button } from '../components/ui'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK']

const fieldLabel = 'mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const inputCls =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-3 py-2.5 text-sm text-text [color-scheme:dark]'
const errorBanner =
  'mt-3 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger'
const okBanner =
  'mt-3 rounded-input border border-accent/40 bg-accent/[0.08] px-3 py-2 text-[11px] text-accent'

interface Props {
  onBack: () => void
}

export function WealthSettingsView({ onBack }: Props) {
  const [goal, setGoal] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSettings()
        setGoal(s.wealthGoal === null ? '' : String(s.wealthGoal))
        setCurrency(s.currency)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const goalNum = goal === '' ? null : Number(goal)
    if (goalNum !== null && !Number.isFinite(goalNum)) {
      setError('Goal must be a number or blank')
      return
    }
    setSaving(true)
    try {
      await updateSettings({ wealthGoal: goalNum, currency })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-[520px] px-4 pb-10 pt-5">
      <div className="mb-3.5 flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Takaisin"
          className="inline-flex h-9 w-9 min-h-0 min-w-0 items-center justify-center rounded-full border border-border bg-transparent p-0 text-text"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-text">
          Wealth settings
        </h1>
      </div>
      <p className="mb-3.5 text-xs leading-relaxed text-muted">
        Wealth goal mirrors as a threshold line on the dashboard chart.
      </p>

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : (
        <Card variant="glass">
          <form onSubmit={onSave}>
            <label className="block">
              <span className={fieldLabel}>Wealth goal ({currency})</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. 500000"
                className={inputCls}
              />
              {goal !== '' && Number.isFinite(Number(goal)) && (
                <span className="mt-1 block text-[11px] text-muted">
                  Shown as: {formatMoney(Number(goal), currency)}
                </span>
              )}
            </label>
            <label className="mt-3.5 block">
              <span className={fieldLabel}>Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className={errorBanner}>{error}</p>}
            {saved && <p className={okBanner}>Saved.</p>}
            <div className="mt-3.5 flex">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </main>
  )
}
