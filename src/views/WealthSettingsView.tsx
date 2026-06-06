import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { getSettings, updateSettings } from '../lib/wealth/settings'
import { formatMoney } from '../lib/wealth/format'
import { C, card, errorBanner, input, labelText, okBanner, primaryBtn } from '../lib/wealth/ui'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK']

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
    <main style={{ padding: '20px 16px 40px', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button
          onClick={onBack}
          aria-label="Takaisin"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.text,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
          Wealth settings
        </h1>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Wealth goal mirrors as a threshold line on the dashboard chart.
      </p>

      {loading ? (
        <div style={{ color: C.muted }}>Loading…</div>
      ) : (
        <form onSubmit={onSave} style={card}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelText}>Wealth goal ({currency})</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. 500000"
              style={input}
            />
            {goal !== '' && Number.isFinite(Number(goal)) && (
              <span style={labelText}>Shown as: {formatMoney(Number(goal), currency)}</span>
            )}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
            <span style={labelText}>Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ ...input, cursor: 'pointer' }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {error && <p style={errorBanner}>{error}</p>}
          {saved && <p style={okBanner}>Saved.</p>}
          <div style={{ marginTop: 14 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}
