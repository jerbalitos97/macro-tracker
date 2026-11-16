import { useState } from 'react'
import { createAsset } from '../../lib/wealth/assets'
import { todayIso } from '../../lib/wealth/format'
import { Card, Field, Button } from '../ui'

const hint = 'mb-2 block text-[12px] leading-4 text-fg-muted'
const errorBanner =
  'mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger'

// Open state lives in WealthView: its "+ Add asset" button sits in the
// section header, the form appears beneath it.
export default function AddAssetForm({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
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
      onClose()
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create asset')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const showContribFields = Number(monthly) > 0

  return (
    <Card className="!p-4">
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-x-2.5">
          <div className="col-span-2">
            <Field
              label="Name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Index fund, Apartment, Loan principal paid"
            />
          </div>
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
          <div className="col-span-2">
            <Field
              label="Expected annual return (%)"
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <span className={hint}>
              Projection applies this monthly: value × (1 + rate/12) + monthly contribution.
            </span>
          </div>
          <div className="col-span-2">
            <Field
              label="Monthly contribution (€/mo) — leave blank for none"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
            <span className={hint}>
              E.g. loan amortisation going into housing equity, or €/mo into ETF.
            </span>
          </div>
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
              onClose()
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
