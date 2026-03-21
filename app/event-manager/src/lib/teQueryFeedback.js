/**
 * Display-layer mapping for Ticket Evolution query outcomes.
 * Does not perform network calls or change API behavior.
 */

/** @typedef {'success' | 'empty' | 'error'} TeQueryFeedbackKind */

/**
 * Maps a successful proxy response to user-facing copy and semantic kind.
 * @param {number} count — event count from the response (same source as UI today)
 * @param {'single' | 'bulk'} queryMode — form mode (single = show, bulk = index)
 * @returns {{ kind: TeQueryFeedbackKind, message: string }}
 */
export function mapTeQueryResultToFeedback(count, queryMode) {
  const n = Math.max(0, Number.isFinite(Number(count)) ? Number(count) : 0)

  if (n === 0) {
    return { kind: 'empty', message: 'No events found' }
  }

  if (n === 1) {
    return { kind: 'success', message: '1 event found' }
  }

  const hint = queryMode === 'bulk' ? ' — select events to add' : ''
  return { kind: 'success', message: `${n} events found${hint}` }
}

/**
 * User-facing message when the fetch fails (network, proxy, auth, etc.).
 * Validation messages are set separately in the form and are not passed here.
 */
export function mapTeFetchErrorToMessage() {
  return 'Unable to fetch events. Please try again.'
}
