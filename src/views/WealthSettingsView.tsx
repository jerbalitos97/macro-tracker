import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../lib/wealth/settings'
import { formatMoney } from '../lib/wealth/format'
import { Card, Button } from '../components/ui'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK']

const fieldLabel = 'mb-1.5 block text-[12px] font-medium leading-4 text-fg-muted'
const inputCls =
  'h-12 w-full rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-4 text-base text-text [color-scheme:dark]'
const errorBanner =
  'mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger'
const okBanner =
  'mt-3 rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-2 text-[14px] text-accent'

interface Props {
  /** Kept for App's call site; the Wealth tabs in the nav bar are the way back. */
  onBack: () => void
}

export function WealthSettingsView(_props: Props) {
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
    <main className="mx-auto flex max-w-[520px] flex-col gap-3 px-4 pb-10 pt-2">
      {loading ? (
        <div className="text-[14px] text-fg-muted">Loading…</div>
      ) : (
        <Card className="!p-4">
          <form onSubmit={onSave} className="flex flex-col">
            <h2 className="text-[16px] font-medium leading-6 text-text">Wealth settings</h2>
            <p className="mb-3 text-[14px] leading-5 text-fg-muted">
              Wealth goal mirrors as a threshold line on the dashboard chart.
            </p>
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
                <span className="mt-1 block text-[12px] leading-4 text-fg-muted">
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
            <div className="mt-4 flex">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </main>
  )
}
