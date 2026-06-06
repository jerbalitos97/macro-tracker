import { useState } from 'react'
import { createAsset } from '../../lib/wealth/assets'
import { todayIso } from '../../lib/wealth/format'
import { C, card, errorBanner, ghostBtn, input, labelText, primaryBtn } from '../../lib/wealth/ui'

export default function AddAssetForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayIso())
  const [rate, setRate] = useState('5')
  const [monthly, setMonthly] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numericValue = Number(value)
    const numericRate = Number(rate)
    const numericMonthly = monthly === '' ? 0 : Number(monthly)
    if (!name.trim()) {
      setError('Name required')
      return
    }
    if (!Number.isFinite(numericValue)) {
      setError('Initial value must be a number')
      return
    }
    if (!Number.isFinite(numericRate)) {
      setError('Expected return must be a number')
      return
    }
    if (!Number.isFinite(numericMonthly)) {
      setError('Monthly contribution must be a number')
      return
    }
    setBusy(true)
    try {
      await createAsset({
        name: name.trim(),
        initialValue: numericValue,
        initialDate: date,
        estimatedAnnualReturn: numericRate,
        monthlyContribution: numericMonthly,
        contributionStart: numericMonthly > 0 && start ? start : null,
        contributionEnd: numericMonthly > 0 && end ? end : null,
      })
      setName('')
      setValue('')
      setDate(todayIso())
      setRate('5')
      setMonthly('')
      setStart('')
      setEnd('')
      setOpen(false)
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create asset')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 12,
          border: `1px dashed ${C.border}`,
          backgroundColor: 'rgba(255,255,255,0.02)',
          color: C.muted,
          fontFamily: 'inherit',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        + Add asset
      </button>
    )
  }

  const showContribFields = Number(monthly) > 0

  return (
    <form onSubmit={onSubmit} style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <span style={labelText}>Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Index fund, Apartment, Loan principal paid"
            style={input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>Initial value</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelText}>Initial date</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={input}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <span style={labelText}>Expected annual return (%)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            style={input}
          />
          <span style={{ ...labelText, fontSize: 10 }}>
            Projection applies this monthly: value × (1 + rate/12) + monthly contribution.
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <span style={labelText}>Monthly contribution (€/mo) — leave blank for none</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            style={input}
          />
          <span style={{ ...labelText, fontSize: 10 }}>
            E.g. loan amortisation going into housing equity, or €/mo into ETF.
          </span>
        </label>
        {showContribFields && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelText}>Contribution start (optional)</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={input}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelText}>Contribution end (optional)</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={input}
              />
            </label>
          </>
        )}
      </div>
      {error && <p style={errorBanner}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Creating…' : 'Create asset'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          style={ghostBtn}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
