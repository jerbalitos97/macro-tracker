import { useState } from 'react'
import { addAssetValue, updateAsset } from '../../lib/wealth/assets'
import { formatMoney, formatPercent, todayIso } from '../../lib/wealth/format'
import type { Asset } from '../../lib/wealth/types'
import { Card, Field, Button } from '../ui'

const errorBanner =
  'mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger'
const textBtn =
  'inline-flex min-h-11 items-center rounded-full bg-transparent px-3 text-[14px] font-semibold text-[#22d3ee]'

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
  /** Removal is the parent's: it hides the card at once and offers undo
   *  before anything is deleted. */
  onDelete: () => void
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
  onDelete,
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

  const meta = [
    `Expected ${formatPercent(asset.estimatedAnnualReturn)}/yr`,
    contribLine,
    change !== null ? `${formatPercent(change)} since start` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="!p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={visible}
        aria-label={`${asset.name}: ${visible ? 'hide from' : 'show on'} chart`}
        className="flex w-full min-w-0 cursor-pointer flex-col gap-1 border-none bg-transparent p-0 text-left text-inherit"
      >
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: swatch, opacity: visible ? 1 : 0.35 }}
            />
            <span className="truncate text-[16px] font-medium leading-6 text-text">{asset.name}</span>
          </span>
          <span className="font-mono text-[18px] leading-6 text-text">
            {currentValue !== null ? formatMoney(currentValue, currency) : '—'}
          </span>
        </span>
        <span className="text-[14px] leading-5 text-fg-muted">{meta}</span>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="action"
          className="flex-none"
          onClick={() => setMode((m) => (m === 'addValue' ? 'closed' : 'addValue'))}
        >
          {mode === 'addValue' ? 'Cancel' : '+ Add value'}
        </Button>
        <button
          type="button"
          className={textBtn}
          onClick={() => (mode === 'edit' ? setMode('closed') : openEdit())}
        >
          {mode === 'edit' ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {mode === 'addValue' && (
        <form onSubmit={onSubmitValue} className="mt-3 grid grid-cols-2 gap-x-2">
          <div className="col-span-2">
            <Field
              label={`New value (${currency})`}
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
            />
          </div>
          <Field
            label="Date"
            type="date"
            required
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
          <div className="flex items-start pt-[22px]">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}

      {mode === 'edit' && (
        <form onSubmit={onSubmitEdit} className="mt-3 grid grid-cols-2 gap-x-2">
          <div className="col-span-2">
            <Field
              label="Name"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
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
          <div className="col-span-2 flex items-center gap-2">
            <button
              type="button"
              className={`${textBtn} !text-[#FFB4AB]`}
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </button>
            <span className="flex-1" />
            <Button type="submit" variant="primary" className="flex-none" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}

      {error && <p className={errorBanner}>{error}</p>}
    </Card>
  )
}
