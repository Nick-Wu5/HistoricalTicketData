import { EmptyState } from '../shared/EmptyState.jsx'

const EVENT_COLUMNS = [
  'te_event_id',
  'title',
  'starts_at',
  'ends_at',
  'polling_enabled',
  'ended_at',
  'olt_url',
  'created_at',
  'updated_at',
]

function renderCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function TrackedEventsResults({
  rows = [],
  total = 0,
  page = 1,
  pageSize = 20,
  loading = false,
  error = '',
  onPrevPage,
  onNextPage,
}) {
  if (loading) {
    return (
      <div className="em-results">
        <EmptyState title="Loading events..." description="Fetching tracked events from Supabase." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="em-results">
        <div className="em-note em-note--error">{error}</div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="em-results">
        <EmptyState
          title="No tracked events found"
          description="Try a different search or clear filters to browse all events."
        />
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="em-results">
      <div className="em-table-wrap">
        <table className="em-table" aria-label="Tracked events">
          <thead>
            <tr>
              {EVENT_COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.te_event_id}>
                {EVENT_COLUMNS.map((column) => (
                  <td key={`${row.te_event_id}-${column}`}>{renderCell(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="em-pagination">
        <div className="em-pagination-total" aria-live="polite">
          {total === 1 ? '1 event' : `${total} events`}
        </div>
        <div
          className="em-pagination-pill"
          role="group"
          aria-label={`Page ${page} of ${totalPages}`}
        >
          <button
            type="button"
            className="em-pagination-segment em-pagination-segment--arrow"
            onClick={onPrevPage}
            disabled={page <= 1}
            aria-label="Previous page"
            title="Previous page"
          >
            ←
          </button>
          <div className="em-pagination-segment em-pagination-segment--indicator" aria-live="polite">
            {page} / {totalPages}
          </div>
          <button
            type="button"
            className="em-pagination-segment em-pagination-segment--arrow"
            onClick={onNextPage}
            disabled={page >= totalPages}
            aria-label="Next page"
            title="Next page"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

