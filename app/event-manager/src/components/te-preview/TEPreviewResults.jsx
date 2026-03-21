import { EmptyState } from '../shared/EmptyState.jsx'

function formatMaybeIso(value) {
  if (!value) return '—'
  return String(value)
}

export function TEPreviewResults({
  rows = [],
  total = 0,
  page = 1,
  pageSize = 10,
  onPrevPage,
  onNextPage,
  selectedIds = [],
  onToggleSelected,
}) {
  if (!total) {
    return (
      <div className="em-results">
        <EmptyState
          title="Fetch events to begin"
          description="Results will show whether each event is already tracked in Supabase."
        />
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="em-results">
      <div className="em-table-wrap">
        <table className="em-table" aria-label="TE preview results">
          <thead>
            <tr>
              <th>Select</th>
              <th>te_event_id</th>
              <th>title</th>
              <th>starts_at</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selectedIds.includes(row.te_event_id)
              const disabled = row.alreadyAdded
              const handleRowClick = (e) => {
                if (disabled) return
                if (e.target.tagName === 'INPUT') return
                onToggleSelected?.(row.te_event_id)
              }
              return (
                <tr
                  key={row.te_event_id}
                  className={disabled ? 'em-row--disabled' : undefined}
                  onClick={handleRowClick}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggleSelected?.(row.te_event_id)}
                    />
                  </td>
                  <td>{row.te_event_id}</td>
                  <td>{row.title || '—'}</td>
                  <td>{formatMaybeIso(row.starts_at)}</td>
                  <td>
                    {row.alreadyAdded ? (
                      <span className="em-preview-pill em-preview-pill--tracked">Tracked</span>
                    ) : (
                      <span className="em-preview-pill em-preview-pill--addable">Not tracked</span>
                    )}
                  </td>
                </tr>
              )
            })}
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
          aria-label={`Preview page ${page} of ${totalPages}`}
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

