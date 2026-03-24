export function renderCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * Extract YYYY-MM-DD from an ISO-ish timestamp string.
 * Returns '—' for empty/null values.
 */
export function formatDateShort(value) {
  if (value === null || value === undefined || value === '') return '—'
  const str = String(value)
  const match = str.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : str
}
