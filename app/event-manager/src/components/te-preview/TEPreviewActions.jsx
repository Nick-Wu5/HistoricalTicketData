import { useState, useEffect, useId } from 'react'
import { Button } from '../shared/Button.jsx'

const PREVIEW_FILTER_ID = 'em-preview-title-filter'

export function TEPreviewActions({
  selectedCount = 0,
  totalSelectable = 0,
  onSelectAll,
  onClearSelection,
  onAddSelected,
  adding = false,
  /** When > 0, title filter UI is shown (client-side filter). */
  loadedCount = 0,
  titleFilter = '',
  onTitleFilterChange,
  onClearTitleFilter,
}) {
  const hasSelection = selectedCount > 0
  const [confirming, setConfirming] = useState(false)
  const showTitleFilter = loadedCount > 0
  const reactId = useId()
  const filterInputId = `${PREVIEW_FILTER_ID}-${reactId.replace(/:/g, '')}`

  useEffect(() => {
    if (!hasSelection) setConfirming(false)
  }, [hasSelection])

  function handleSelectionAction() {
    if (adding) return
    if (hasSelection) {
      setConfirming(false)
      onClearSelection?.()
    } else {
      onSelectAll?.()
    }
  }

  function handleAddClick() {
    setConfirming(true)
  }

  function handleConfirm() {
    onAddSelected?.()
    setConfirming(false)
  }

  function handleCancel() {
    setConfirming(false)
  }

  return (
    <div className="em-toolbar em-toolbar--preview">
      <div className="em-toolbar-left em-toolbar-left--preview">
        {showTitleFilter ? (
          <div className="em-preview-toolbar-filter__input em-preview-toolbar-filter__input--bare">
            <label htmlFor={filterInputId} className="em-visually-hidden">
              Filter by title
            </label>
            <input
              id={filterInputId}
              className="em-input"
              type="search"
              value={titleFilter}
              onChange={(e) => onTitleFilterChange?.(e.target.value)}
              placeholder="Filter by title…"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        ) : null}
        <Button
          type="button"
          variant="tertiary"
          onClick={handleSelectionAction}
          disabled={adding || (!hasSelection && totalSelectable === 0)}
          aria-label={hasSelection ? 'Clear selection' : `Select all ${totalSelectable} available events`}
        >
          {hasSelection ? 'Clear selection' : 'Select all'}
        </Button>
        {showTitleFilter && titleFilter.trim() ? (
          <button
            type="button"
            className="em-text-action em-preview-toolbar-clear"
            onClick={onClearTitleFilter}
          >
            Clear filter
          </button>
        ) : null}
      </div>
      <div className="em-toolbar-right">
        {confirming ? (
          <div className="em-confirm-group" role="alert" aria-live="assertive">
            <span className="em-confirm-label">
              Add {selectedCount} {selectedCount === 1 ? 'event' : 'events'} to database?
            </span>
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={adding}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={adding}
              aria-busy={adding}
            >
              {adding ? 'Adding…' : 'Confirm'}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant={hasSelection ? 'primary' : 'secondary'}
            className="em-btn--add-selected"
            disabled={!hasSelection || adding}
            onClick={handleAddClick}
          >
            {hasSelection ? `Add ${selectedCount} selected` : 'Add selected'}
          </Button>
        )}
      </div>
    </div>
  )
}
