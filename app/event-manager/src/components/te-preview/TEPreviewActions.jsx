import { Button } from '../shared/Button.jsx'

export function TEPreviewActions({
  selectedCount = 0,
  onSelectAllVisible,
  onClearSelection,
  onAddSelected,
  adding = false,
}) {
  const hasSelection = selectedCount > 0

  function handleSelectionAction() {
    if (adding) return
    if (hasSelection) onClearSelection?.()
    else onSelectAllVisible?.()
  }

  return (
    <div className="em-toolbar em-toolbar--preview">
      <div className="em-toolbar-left">
        <Button
          type="button"
          variant="tertiary"
          onClick={handleSelectionAction}
          disabled={adding}
          aria-label={hasSelection ? 'Clear selection' : 'Select all on this page'}
        >
          {hasSelection ? 'Clear selection' : 'Select all'}
        </Button>
      </div>
      <div className="em-toolbar-right">
        <Button
          type="button"
          variant="primary"
          className="em-btn--add-selected"
          disabled={!hasSelection || adding}
          onClick={onAddSelected}
          aria-busy={adding}
        >
          {adding ? 'Adding…' : 'Add selected'}
        </Button>
      </div>
    </div>
  )
}
