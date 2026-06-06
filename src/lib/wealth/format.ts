// Currency + percent + date string helpers shared across the wealth UI.

export function formatMoney(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
