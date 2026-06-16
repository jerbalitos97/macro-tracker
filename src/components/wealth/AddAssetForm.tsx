import { useState } from 'react'
import { createAsset } from '../../lib/wealth/assets'
import { todayIso } from '../../lib/wealth/format'
import { Card, Field, Button } from '../ui'

const fieldLabel = 'mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted'
const inputCls =
  'w-full rounded-input border border-white/10 bg-black/[0.45] px-3 py-2.5 text-sm text-text [color-scheme:dark]'
const errorBanner =
  'mt-3 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger'

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
        className="w-full rounded-glass border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-3.5 text-[13px] text-muted"
      >
        + Add asset
      </button>
    )
  }

  const showContribFields = Number(monthly) > 0

  return (
    <Card variant="glass">
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            label="Name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Index fund, Apartment, Loan principal paid"
            className="col-span-2"
          />
          <Field
            label="Initial value"
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Field
            label="Initial date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="col-span-2 block">
            <span className={fieldLabel}>Expected annual return (%)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={inputCls}
            />
            <span className="mt-1 block text-[10px] text-muted">
              Projection applies this monthly: value × (1 + rate/12) + monthly contribution.
            </span>
          </label>
          <label className="col-span-2 block">
            <span className={fieldLabel}>Monthly contribution (€/mo) — leave blank for none</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className={inputCls}
            />
            <span className="mt-1 block text-[10px] text-muted">
              E.g. loan amortisation going into housing equity, or €/mo into ETF.
            </span>
          </label>
          {showContribFields && (
            <>
              <Field
                label="Contribution start (optional)"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <Field
                label="Contribution end (optional)"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </>
          )}
        </div>
        {error && <p className={errorBanner}>{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create asset'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
