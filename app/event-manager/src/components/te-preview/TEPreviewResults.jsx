import { Pagination } from '../shared/Pagination.jsx'
import { TruncatedCell } from '../shared/TruncatedCell.jsx'
import { renderCell, formatDateShort } from '../../lib/formatCell.js'

export function TEPreviewResults({
  rows = [],
  total = 0,
  loadedCount = 0,
  page = 1,
  pageSize = 10,
  onPrevPage,
  onNextPage,
  selectedIds = [],
  onToggleSelected,
}) {
  const hasRows = total > 0
  const showEmptyFetchHint = !loadedCount && !hasRows
  const showNoFilterMatches = loadedCount > 0 && !hasRows

  return (
    <div className="em-results">
      <div className="em-table-wrap">
        <table className="em-table em-table--fixed" aria-label="TE preview results">
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '53%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
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
            {showEmptyFetchHint ? (
              <tr className="em-table-row--placeholder">
                <td colSpan={5}>
                  <span className="em-table-placeholder">Run fetch above to load results.</span>
                  <span className="em-visually-hidden">
                    No preview rows yet. Use the fetch controls above.
                  </span>
                </td>
              </tr>
            ) : null}
            {showNoFilterMatches ? (
              <tr className="em-table-row--placeholder">
                <td colSpan={5}>
                  <span className="em-table-placeholder">No events match this filter.</span>
                  <span className="em-visually-hidden">Try a different search or clear the filter.</span>
                </td>
              </tr>
            ) : null}
            {hasRows
              ? rows.map((row) => {
                  const checked = selectedIds.includes(row.te_event_id)
                  const disabled = row.alreadyAdded
                  const handleRowClick = (e) => {
                    if (disabled) return
                    if (e.target.tagName === 'INPUT') return
                    onToggleSelected?.(row.te_event_id)
                  }
                  const dateShort = formatDateShort(row.starts_at)
                  const dateFull = renderCell(row.starts_at)
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
                      <td>
                        <TruncatedCell text={renderCell(row.title)} variant="title" />
                      </td>
                      <td>
                        <span title={dateFull !== '—' ? dateFull : undefined}>{dateShort}</span>
                      </td>
                      <td>
                        {row.alreadyAdded ? (
                          <span className="em-preview-pill em-preview-pill--tracked">Tracked</span>
                        ) : (
                          <span className="em-preview-pill em-preview-pill--addable">Not tracked</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </div>

      {loadedCount > 0 && total > 0 ? (
        <Pagination
          total={total}
          loadedCount={loadedCount}
          page={page}
          pageSize={pageSize}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
          ariaLabelPrefix="Preview"
        />
      ) : null}
    </div>
  )
}
