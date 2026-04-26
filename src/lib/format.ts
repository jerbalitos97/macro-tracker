/**
 * Parse a decimal string that may use comma (Finnish) or period (English).
 * Returns NaN if the string is empty or unparseable.
 */
export function parseDecimal(s: string): number {
  if (s === '' || s === null || s === undefined) return NaN
  return parseFloat(s.replace(',', '.'))
}

/**
 * Parse a positive decimal. Returns 0 for negative or NaN results.
 */
export function parsePositiveDecimal(s: string): number {
  const n = parseDecimal(s)
  if (isNaN(n) || n < 0) return 0
  return n
}

/**
 * Parse a positive integer. Strips commas/periods first.
 * Returns 0 for invalid input.
 */
export function parsePositiveInt(s: string): number {
  const n = parseInt(s.replace(',', '.'), 10)
  if (isNaN(n) || n < 0) return 0
  return n
}

/**
 * Returns true if the string is a valid partial decimal input
 * (digits, optional leading minus, optional single comma or period).
 * Used to gate onChange so the user can type "74," without it being reset.
 */
export function isValidDecimalInput(s: string): boolean {
  return /^-?\d*[,.]?\d*$/.test(s)
}
