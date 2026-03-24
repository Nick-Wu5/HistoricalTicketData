import { TEPreviewActions } from './TEPreviewActions.jsx'
import { TEPreviewResults } from './TEPreviewResults.jsx'

export function TEPreviewSection({
  rows,
  totalPreviewRows = 0,
  loadedCount = 0,
  page = 1,
  pageSize = 10,
  onPrevPage,
  onNextPage,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  totalSelectable = 0,
  onClearSelection,
  onAddSelected,
  adding,
  titleFilter = '',
  onTitleFilterChange,
  onClearTitleFilter,
}) {
  return (
    <div className="em-add-events-preview">
      <div className="em-add-events-preview__toolbar">
        <TEPreviewActions
          selectedCount={selectedIds.length}
          totalSelectable={totalSelectable}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onAddSelected={onAddSelected}
          adding={adding}
          loadedCount={loadedCount}
          titleFilter={titleFilter}
          onTitleFilterChange={onTitleFilterChange}
          onClearTitleFilter={onClearTitleFilter}
        />
      </div>
      <TEPreviewResults
        rows={rows}
        total={totalPreviewRows}
        loadedCount={loadedCount}
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
