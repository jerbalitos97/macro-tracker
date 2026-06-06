import { useState } from 'react'
import { addAssetValue, deleteAsset, updateAsset } from '../../lib/wealth/assets'
import { formatMoney, formatPercent, todayIso } from '../../lib/wealth/format'
import type { Asset } from '../../lib/wealth/types'
import { C, card, errorBanner, ghostBtn, input, labelText, primaryBtn, secondaryBtn } from '../../lib/wealth/ui'

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
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={visible}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            textAlign: 'left',
            cursor: 'pointer',
            color: 'inherit',
            minHeight: 'auto',
            minWidth: 'auto',
          }}
        >
          <span
            aria-hidden
            style={{
              marginTop: 4,
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: swatch,
              opacity: visible ? 1 : 0.35,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{asset.name}</div>
            <div style={{ ...labelText, marginTop: 2 }}>
              Expected {formatPercent(asset.estimatedAnnualReturn)}/yr · tap to{' '}
              {visible ? 'hide' : 'show'} on chart
            </div>
            {contribLine && (
              <div style={{ fontSize: 11, color: C.accent, marginTop: 2 }}>{contribLine}</div>
            )}
          </div>
        </button>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {currentValue !== null ? formatMoney(currentValue, currency) : '—'}
          </div>
          {change !== null && (
            <div style={{ fontSize: 11, color: change >= 0 ? C.accent : C.danger, marginTop: 2 }}>
              {formatPercent(change)} since start
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'addValue' ? 'closed' : 'addValue'))}
          style={secondaryBtn}
        >
          {mode === 'addValue' ? 'Cancel' : '+ Add value'}
        </button>
        <button
          type="button"
          onClick={() => (mode === 'edit' ? setMode('closed') : openEdit())}
          style={secondaryBtn}
        >
          {mode === 'edit' ? 'Cancel' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          style={{ ...ghostBtn, opacity: busy ? 0.5 : 1 }}
        >
          Delete
        </button>
      </div>

      {mode === 'addValue' && (
        <form
          onSubmit={onSubmitValue}
          style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={labelText}>New value ({currency})</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              style={input}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelText}>Date</span>
            <input
              type="date"
              required
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              style={input}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {mode === 'edit' && (
        <form
          onSubmit={onSubmitEdit}
          style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={labelText}>Name</span>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={input}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelText}>Expected annual return (%)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={editRate}
              onChange={(e) => setEditRate(e.target.value)}
              style={input}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelText}>Monthly contribution (€/mo)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={editMonthly}
              onChange={(e) => setEditMonthly(e.target.value)}
              style={input}
            />
          </label>
          {Number(editMonthly) > 0 && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelText}>Contribution start</span>
                <input
                  type="date"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  style={input}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={labelText}>Contribution end</span>
                <input
                  type="date"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  style={input}
                />
              </label>
            </>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {error && <p style={errorBanner}>{error}</p>}
    </div>
  )
}
