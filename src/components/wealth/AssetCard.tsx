import { useState } from 'react'
import { addAssetValue, deleteAsset, updateAsset } from '../../lib/wealth/assets'
import { formatMoney, formatPercent, todayIso } from '../../lib/wealth/format'
import type { Asset } from '../../lib/wealth/types'
import { Card, Field, Button } from '../ui'

const errorBanner =
  'mt-3 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger'

type Mode = 'closed' | 'addValue' | 'edit'

type Props = {
  asset: Asset
  currentValue: number | null
  initialValue: number | null
  visible: boolean
  swatch: string
  currency: string
  onToggle: () => void
  onChange: () => void
}

export default function AssetCard({
  asset,
  currentValue,
  initialValue,
  visible,
  swatch,
  currency,
  onToggle,
  onChange,
}: Props) {
  const [mode, setMode] = useState<Mode>('closed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [valueInput, setValueInput] = useState('')
  const [dateInput, setDateInput] = useState(todayIso())
  const [editName, setEditName] = useState(asset.name)
  const [editRate, setEditRate] = useState(String(asset.estimatedAnnualReturn))
  const [editMonthly, setEditMonthly] = useState(
    asset.monthlyContribution > 0 ? String(asset.monthlyContribution) : '',
  )
  const [editStart, setEditStart] = useState(asset.contributionStart ?? '')
  const [editEnd, setEditEnd] = useState(asset.contributionEnd ?? '')

  function openEdit() {
    setEditName(asset.name)
    setEditRate(String(asset.estimatedAnnualReturn))
    setEditMonthly(asset.monthlyContribution > 0 ? String(asset.monthlyContribution) : '')
    setEditStart(asset.contributionStart ?? '')
    setEditEnd(asset.contributionEnd ?? '')
    setError(null)
    setMode('edit')
  }

  async function onSubmitValue(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numeric = Number(valueInput)
    if (!Number.isFinite(numeric)) {
      setError('Enter a number')
      return
    }
    setBusy(true)
    try {
      await addAssetValue({ assetId: asset.id, value: numeric, recordedAt: dateInput })
      setValueInput('')
      setDateInput(todayIso())
      setMode('closed')
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numericRate = Number(editRate)
    const numericMonthly = editMonthly === '' ? 0 : Number(editMonthly)
    if (!editName.trim()) {
      setError('Name required')
      return
    }
    if (!Number.isFinite(numericRate)) {
      setError('Return must be a number')
      return
    }
    if (!Number.isFinite(numericMonthly)) {
      setError('Monthly contribution must be a number')
      return
    }
    setBusy(true)
    try {
      await updateAsset(asset.id, {
        name: editName.trim(),
        estimatedAnnualReturn: numericRate,
        monthlyContribution: numericMonthly,
        contributionStart: numericMonthly > 0 && editStart ? editStart : null,
        contributionEnd: numericMonthly > 0 && editEnd ? editEnd : null,
      })
      setMode('closed')
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!confirm(`Delete asset "${asset.name}" and all its history?`)) return
    setBusy(true)
    try {
      await deleteAsset(asset.id)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const change =
    currentValue !== null && initialValue !== null && initialValue > 0
      ? ((currentValue - initialValue) / initialValue) * 100
      : null

  const contribLine =
    asset.monthlyContribution > 0
      ? `+${formatMoney(asset.monthlyContribution, currency)}/mo` +
        (asset.contributionStart ? ` from ${asset.contributionStart}` : '') +
        (asset.contributionEnd ? ` to ${asset.contributionEnd}` : '')
      : null

  return (
    <Card variant="glass">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={visible}
          className="flex min-h-0 min-w-0 cursor-pointer items-start gap-2.5 border-none bg-transparent p-0 text-left text-inherit"
        >
          <span
            aria-hidden
            className="mt-1 inline-block h-3 w-3 flex-shrink-0 rounded-full"
            style={{ background: swatch, opacity: visible ? 1 : 0.35 }}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text">{asset.name}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              Expected {formatPercent(asset.estimatedAnnualReturn)}/yr · tap to{' '}
              {visible ? 'hide' : 'show'} on chart
            </div>
            {contribLine && (
              <div className="mt-0.5 text-[11px] text-accent">{contribLine}</div>
            )}
          </div>
        </button>
        <div className="min-w-0 text-right">
          <div className="text-[18px] font-semibold tabular-nums text-text">
            {currentValue !== null ? formatMoney(currentValue, currency) : '—'}
          </div>
          {change !== null && (
            <div className={`mt-0.5 text-[11px] ${change >= 0 ? 'text-[#8acb88]' : 'text-danger'}`}>
              {formatPercent(change)} since start
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-none"
          onClick={() => setMode((m) => (m === 'addValue' ? 'closed' : 'addValue'))}
        >
          {mode === 'addValue' ? 'Cancel' : '+ Add value'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-none"
          onClick={() => (mode === 'edit' ? setMode('closed') : openEdit())}
        >
          {mode === 'edit' ? 'Cancel' : 'Edit'}
        </Button>
        <Button type="button" variant="ghost" className="flex-none" onClick={onDelete} disabled={busy}>
          Delete
        </Button>
      </div>

      {mode === 'addValue' && (
        <form onSubmit={onSubmitValue} className="mt-3 grid grid-cols-2 gap-2">
          <Field
            label={`New value (${currency})`}
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            className="col-span-2"
          />
          <Field
            label="Date"
            type="date"
            required
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}

      {mode === 'edit' && (
        <form onSubmit={onSubmitEdit} className="mt-3 grid grid-cols-2 gap-2">
          <Field
            label="Name"
            type="text"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="col-span-2"
          />
          <Field
            label="Expected annual return (%)"
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={editRate}
            onChange={(e) => setEditRate(e.target.value)}
          />
          <Field
            label="Monthly contribution (€/mo)"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            value={editMonthly}
            onChange={(e) => setEditMonthly(e.target.value)}
          />
          {Number(editMonthly) > 0 && (
            <>
              <Field
                label="Contribution start"
                type="date"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
              />
              <Field
                label="Contribution end"
                type="date"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
              />
            </>
          )}
          <div className="col-span-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}

      {error && <p className={errorBanner}>{error}</p>}
    </Card>
  )
}
