function formatEventSummary(total, loadedCount) {
  const t = typeof total === 'number' ? total : 0
  const lc = typeof loadedCount === 'number' ? loadedCount : null
  if (lc != null && lc > 0) {
    return `Showing ${t.toLocaleString()} of ${lc.toLocaleString()} event${lc === 1 ? '' : 's'}`
  }
  if (t === 0) return '0 events'
  if (t === 1) return '1 event'
  return `${t.toLocaleString()} events`
}

export function Pagination({
  total,
  page,
  pageSize,
  onPrevPage,
  onNextPage,
  ariaLabelPrefix = '',
  /** When true, prev/next are disabled (e.g. page fetch in flight). */
  busy = false,
  /**
   * When set and different from `total` (e.g. client-side filter), left label shows
   * "Showing X of Y events". Otherwise shows "Y events".
   */
  loadedCount,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const prefix = ariaLabelPrefix ? `${ariaLabelPrefix} page` : `Page`
  const navDisabled = busy

  return (
    <div className="em-pagination">
      <div className="em-pagination-total" aria-live="polite">
        {formatEventSummary(total, loadedCount)}
      </div>
      <div
        className="em-pagination-pill"
        role="group"
        aria-label={`${prefix} ${page} of ${totalPages}`}
        aria-busy={busy}
      >
        <button
          type="button"
          className="em-pagination-segment em-pagination-segment--arrow"
          onClick={onPrevPage}
          disabled={page <= 1 || navDisabled}
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
          disabled={page >= totalPages || navDisabled}
          aria-label="Next page"
          title="Next page"
        >
          →
        </button>
      </div>
    </div>
  )
}
