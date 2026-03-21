import { TEPreviewActions } from './TEPreviewActions.jsx'
import { TEPreviewResults } from './TEPreviewResults.jsx'

export function TEPreviewSection({
  rows,
  totalPreviewRows = 0,
  page = 1,
  pageSize = 10,
  onPrevPage,
  onNextPage,
  selectedIds,
  onToggleSelected,
  onSelectAllVisible,
  onClearSelection,
  onAddSelected,
  adding,
  statusMessage,
  errorMessage,
}) {
  return (
    <div className="em-add-events-preview">
      <div className="em-add-events-preview__toolbar">
        <TEPreviewActions
          selectedCount={selectedIds.length}
          onSelectAllVisible={onSelectAllVisible}
          onClearSelection={onClearSelection}
          onAddSelected={onAddSelected}
          adding={adding}
        />
        {statusMessage ? (
          <div className="em-note em-note--inline em-note--compact em-note--success" role="status" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="em-note em-note--inline em-note--compact em-note--error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>
      <TEPreviewResults
        rows={rows}
        total={totalPreviewRows}
        page={page}
        pageSize={pageSize}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
      />
    </div>
  )
}

