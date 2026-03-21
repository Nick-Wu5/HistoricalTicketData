import { TextInput } from '../shared/TextInput.jsx'
import { Button } from '../shared/Button.jsx'
import { ToggleField } from '../shared/ToggleField.jsx'
import { useMemo, useState } from 'react'
import { queryTeEventsProxy } from '../../api/teProxy.js'
import { mapTeFetchErrorToMessage, mapTeQueryResultToFeedback } from '../../lib/teQueryFeedback.js'

export function TEQueryForm({ mode = 'single', onQuerySuccess }) {
  const [eventId, setEventId] = useState('')
  const [performerId, setPerformerId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categoryTreeEnabled, setCategoryTreeEnabled] = useState(false)
  const [queryFeedback, setQueryFeedback] = useState(null)
  const [queryError, setQueryError] = useState('')
  const [loading, setLoading] = useState(false)

  const canUseCategoryTree = useMemo(() => {
    if (mode !== 'bulk') return false
    const v = String(categoryId ?? '').trim()
    return v.length > 0
  }, [categoryId, mode])

  function parsePositiveInt(value) {
    const n = Number.parseInt(String(value ?? '').trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  async function onSubmit(e) {
    e.preventDefault()
    setQueryError('')
    setQueryFeedback(null)

    const eventIdTrim = eventId.trim()
    const performerTrim = performerId.trim()
    const venueTrim = venueId.trim()
    const categoryTrim = categoryId.trim()

    let payload
    if (mode === 'single') {
      if (!eventIdTrim) {
        setQueryError('Enter an event ID.')
        return
      }
      const parsedEventId = parsePositiveInt(eventIdTrim)
      if (!parsedEventId) {
        setQueryError('Event ID must be a positive integer.')
        return
      }
      payload = { mode: 'show', event_id: parsedEventId }
    } else {
      if (!performerTrim && !venueTrim && !categoryTrim) {
        setQueryError('Enter at least one filter: performer ID, venue ID, or category ID.')
        return
      }
      if (categoryTreeEnabled && !categoryTrim) {
        setQueryError('Include subcategories requires category ID.')
        return
      }

      const parsedPerformerId = performerTrim ? parsePositiveInt(performerTrim) : null
      const parsedVenueId = venueTrim ? parsePositiveInt(venueTrim) : null
      const parsedCategoryId = categoryTrim ? parsePositiveInt(categoryTrim) : null

      if (performerTrim && !parsedPerformerId) {
        setQueryError('Performer ID must be a positive integer.')
        return
      }
      if (venueTrim && !parsedVenueId) {
        setQueryError('Venue ID must be a positive integer.')
        return
      }
      if (categoryTrim && !parsedCategoryId) {
        setQueryError('Category ID must be a positive integer.')
        return
      }

      payload = {
        mode: 'index',
        performer_id: parsedPerformerId ?? undefined,
        venue_id: parsedVenueId ?? undefined,
        category_id: parsedCategoryId ?? undefined,
        category_tree: categoryTrim ? categoryTreeEnabled : undefined,
      }
    }

    setLoading(true)
    try {
      const result = await queryTeEventsProxy(payload)
      onQuerySuccess?.(Array.isArray(result?.events) ? result.events : [])
      const count = result?.count ?? 0
      const queryMode = mode === 'single' ? 'single' : 'bulk'
      setQueryFeedback(mapTeQueryResultToFeedback(count, queryMode))
    } catch {
      setQueryFeedback(null)
      setQueryError(mapTeFetchErrorToMessage())
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="em-form em-form--add-events" onSubmit={onSubmit}>
      {mode === 'single' ? (
        <div className="em-form-row em-form-row--single">
          <TextInput
            label="Event ID"
            placeholder="Enter event ID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          />
        </div>
      ) : (
        <div className="em-form-row em-form-row--wrap">
          <TextInput
            label="Performer ID"
            placeholder="Optional"
            value={performerId}
            onChange={(e) => setPerformerId(e.target.value)}
          />
          <TextInput
            label="Venue ID"
            placeholder="Optional"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          />
          <TextInput
            label="Category ID"
            placeholder="Optional"
            value={categoryId}
            onChange={(e) => {
              const next = e.target.value
              setCategoryId(next)
              if (String(next ?? '').trim().length === 0) setCategoryTreeEnabled(false)
            }}
          />
          <ToggleField
            label="Include subcategories"
            checked={categoryTreeEnabled}
            disabled={!canUseCategoryTree}
            onChange={setCategoryTreeEnabled}
          />
        </div>
      )}

      <div className="em-query-fetch-bar">
        <div className="em-query-fetch-bar__submit">
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? 'Fetching…' : mode === 'single' ? 'Fetch event' : 'Fetch events'}
          </Button>
        </div>
        {queryFeedback || queryError ? (
          <div className="em-query-fetch-bar__feedback" aria-live="polite">
            {queryFeedback ? (
              <div
                className={`em-note em-note--inline ${queryFeedback.kind === 'empty' ? 'em-note--empty' : 'em-note--success'}`}
                role="status"
              >
                {queryFeedback.message}
              </div>
            ) : null}
            {queryError ? (
              <div className="em-note em-note--inline em-note--error" role="alert">
                {queryError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  )
}

