import { EmptyState } from '../shared/EmptyState.jsx'
import { Pagination } from '../shared/Pagination.jsx'
import { TruncatedCell } from '../shared/TruncatedCell.jsx'
import { renderCell, formatDateShort } from '../../lib/formatCell.js'

const EVENT_COLUMNS = [
  { key: 'te_event_id', label: 'te_event_id', width: '7%' },
  { key: 'title', label: 'title', truncate: 'title', width: '36%' },
  { key: 'starts_at', label: 'starts_at', date: true, width: '10%' },
  { key: 'polling_enabled', label: 'polling', width: '7%' },
  { key: 'ended_at', label: 'ended_at', date: true, width: '10%' },
  { key: 'olt_url', label: 'olt_url', truncate: 'url', width: '18%' },
  { key: 'updated_at', label: 'updated_at', date: true, width: '12%' },
]

export function TrackedEventsResults({
  rows = [],
  total = 0,
  page = 1,
  pageSize = 15,
  /** Full empty loading (first load only). */
  loadingFull = false,
  /** Page change in flight — keep rows visible, subtle feedback. */
  isPaginating = false,
  error = '',
  onPrevPage,
  onNextPage,
  onDismissError,
}) {
  if (loadingFull && !error) {
    return (
      <div className="em-results">
        <EmptyState title="Loading events..." description="Fetching tracked events from Supabase." />
      </div>
    )
  }

  if (error && !rows.length) {
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

  return (
    <div className="em-results">
      {error ? (
        <div className="em-note em-note--error em-note--inline" role="alert">
          <span>{error}</span>
          {onDismissError ? (
            <button type="button" className="em-text-action" onClick={onDismissError}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        className={`em-table-wrap${isPaginating ? ' em-table-wrap--busy' : ''}`}
        aria-busy={isPaginating}
      >
        <table className="em-table em-table--fixed" aria-label="Tracked events">
          <colgroup>
            {EVENT_COLUMNS.map((col) => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {EVENT_COLUMNS.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.te_event_id}>
                {EVENT_COLUMNS.map((col) => {
                  const raw = row[col.key]
                  if (col.date) {
                    const short = formatDateShort(raw)
                    const full = renderCell(raw)
                    return (
                      <td key={`${row.te_event_id}-${col.key}`}>
                        <span title={full !== '—' ? full : undefined}>{short}</span>
                      </td>
                    )
                  }
                  const text = renderCell(raw)
                  return (
                    <td key={`${row.te_event_id}-${col.key}`}>
                      {col.truncate
                        ? <TruncatedCell text={text} variant={typeof col.truncate === 'string' ? col.truncate : undefined} />
                        : text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        busy={isPaginating}
      />
    </div>
  )
}
