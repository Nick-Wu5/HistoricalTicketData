import { TrackedEventsSearchForm } from './TrackedEventsSearchForm.jsx'
import { TrackedEventsResults } from './TrackedEventsResults.jsx'
import { useEffect, useState } from 'react'
import { fetchTrackedEvents, TRACKED_EVENTS_PAGE_SIZE } from '../../api/trackedEvents.js'

export function TrackedEventsSection() {
  const [teEventId, setTeEventId] = useState('')
  const [eventName, setEventName] = useState('')
  const [activeTeEventId, setActiveTeEventId] = useState('')
  const [activeEventName, setActiveEventName] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadRows(nextPage = page, filters = null) {
    setLoading(true)
    setError('')
    try {
      const resolvedFilters = filters ?? {
        teEventId: activeTeEventId,
        eventName: activeEventName,
      }
      const result = await fetchTrackedEvents({
        teEventId: resolvedFilters.teEventId,
        eventName: resolvedFilters.eventName,
        page: nextPage,
        pageSize: TRACKED_EVENTS_PAGE_SIZE,
      })
      setRows(result.rows)
      setTotal(result.total)
      setPage(nextPage)
    } catch (err) {
      setRows([])
      setTotal(0)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial behavior for no filters: show all events paginated (sorted by te_event_id).
    loadRows(1, { teEventId: '', eventName: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onTrackedUpdated() {
      loadRows(1)
    }
    window.addEventListener('events:tracked-updated', onTrackedUpdated)
    return () => window.removeEventListener('events:tracked-updated', onTrackedUpdated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeEventId, activeEventName, page])

  function onSearch() {
    setActiveTeEventId(teEventId)
    setActiveEventName(eventName)
    loadRows(1, { teEventId, eventName })
  }

  function onResetFilters() {
    setTeEventId('')
    setEventName('')
    setActiveTeEventId('')
    setActiveEventName('')
    loadRows(1, { teEventId: '', eventName: '' })
  }

  const filtersActive =
    String(activeTeEventId ?? '').trim() !== '' || String(activeEventName ?? '').trim() !== ''

  const totalPages = Math.max(1, Math.ceil(total / TRACKED_EVENTS_PAGE_SIZE))

  return (
    <div className="em-stack">
      <TrackedEventsSearchForm
        teEventId={teEventId}
        eventName={eventName}
        onTeEventIdChange={setTeEventId}
        onEventNameChange={setEventName}
        onSearch={onSearch}
        loading={loading}
      />
      {filtersActive ? (
        <div className="em-filter-meta">
          <button type="button" className="em-text-action" onClick={onResetFilters} disabled={loading}>
            Reset filters
          </button>
        </div>
      ) : null}
      <TrackedEventsResults
        rows={rows}
        total={total}
        page={page}
        pageSize={TRACKED_EVENTS_PAGE_SIZE}
        loading={loading}
        error={error}
        onPrevPage={() => loadRows(Math.max(1, page - 1))}
        onNextPage={() => loadRows(Math.min(totalPages, page + 1))}
      />
    </div>
  )
}

