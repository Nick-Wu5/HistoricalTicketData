import { TrackedEventsSearchForm } from './TrackedEventsSearchForm.jsx'
import { TrackedEventsResults } from './TrackedEventsResults.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTrackedEvents } from '../../api/trackedEvents.js'
import { useViewportPageSize } from '../../hooks/useViewportPageSize.js'

/** @typedef {'initial' | 'search' | 'page' | 'refresh'} LoadMode */

export function TrackedEventsSection() {
  const pageSize = useViewportPageSize()

  const [teEventId, setTeEventId] = useState('')
  const [eventName, setEventName] = useState('')
  const [activeTeEventId, setActiveTeEventId] = useState('')
  const [activeEventName, setActiveEventName] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  /** True only while Search / Reset is fetching — drives the Search button only. */
  const [isSearching, setIsSearching] = useState(false)
  /** True only while changing pages — subtle table/pagination feedback, not Search. */
  const [isPaginating, setIsPaginating] = useState(false)
  /** First load only: full empty loading state before any data has been shown. */
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [error, setError] = useState('')

  const pageSizeRef = useRef(pageSize)
  pageSizeRef.current = pageSize

  const loadRows = useCallback(
    /**
     * @param {number} [nextPage]
     * @param {{ teEventId?: string, eventName?: string } | null} [filters]
     * @param {LoadMode} [mode]
     */
    async (nextPage = 1, filters = null, mode = 'refresh') => {
      const resolvedFilters = filters ?? {
        teEventId: activeTeEventId,
        eventName: activeEventName,
      }

      if (mode === 'search') setIsSearching(true)
      if (mode === 'page') setIsPaginating(true)

      setError('')
      try {
        const result = await fetchTrackedEvents({
          teEventId: resolvedFilters.teEventId,
          eventName: resolvedFilters.eventName,
          page: nextPage,
          pageSize: pageSizeRef.current,
        })
        setRows(result.rows)
        setTotal(result.total)
        setPage(nextPage)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (mode === 'page') {
          setError(message)
        } else if (mode === 'refresh') {
          setError(message)
        } else {
          setRows([])
          setTotal(0)
          setError(message)
        }
      } finally {
        if (mode === 'search') setIsSearching(false)
        if (mode === 'page') setIsPaginating(false)
        if (mode === 'initial') setIsBootstrapping(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTeEventId, activeEventName],
  )

  useEffect(() => {
    loadRows(1, { teEventId: '', eventName: '' }, 'initial')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onTrackedUpdated() {
      loadRows(1, null, 'refresh')
    }
    window.addEventListener('events:tracked-updated', onTrackedUpdated)
    return () => window.removeEventListener('events:tracked-updated', onTrackedUpdated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRows])

  const initialMount = useRef(true)
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      return
    }
    loadRows(1, null, 'refresh')
  }, [pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch() {
    setActiveTeEventId(teEventId)
    setActiveEventName(eventName)
    loadRows(1, { teEventId, eventName }, 'search')
  }

  function onResetFilters() {
    setTeEventId('')
    setEventName('')
    setActiveTeEventId('')
    setActiveEventName('')
    loadRows(1, { teEventId: '', eventName: '' }, 'search')
  }

  const filtersActive =
    String(activeTeEventId ?? '').trim() !== '' || String(activeEventName ?? '').trim() !== ''

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="em-stack">
      <TrackedEventsSearchForm
        teEventId={teEventId}
        eventName={eventName}
        onTeEventIdChange={setTeEventId}
        onEventNameChange={setEventName}
        onSearch={onSearch}
        loading={isSearching}
      />
      {filtersActive ? (
        <div className="em-filter-meta">
          <button type="button" className="em-text-action" onClick={onResetFilters} disabled={isSearching}>
            Reset filters
          </button>
        </div>
      ) : null}
      <TrackedEventsResults
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        loadingFull={isBootstrapping}
        isPaginating={isPaginating}
        error={error}
        onPrevPage={() => loadRows(Math.max(1, page - 1), null, 'page')}
        onNextPage={() => loadRows(Math.min(totalPages, page + 1), null, 'page')}
        onDismissError={() => setError('')}
      />
    </div>
  )
}
