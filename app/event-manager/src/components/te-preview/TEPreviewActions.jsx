import { Button } from '../shared/Button.jsx'

export function TEPreviewActions() {
  return (
    <div className="em-toolbar">
      <div className="em-toolbar-left">
        <Button type="button" variant="ghost">
          Select all visible
        </Button>
        <Button type="button" variant="ghost">
          Clear selection
        </Button>
      </div>
      <div className="em-toolbar-right">
        <Button type="button" variant="primary">
          Add Selected Events
        </Button>
      </div>
    </div>
  )
}

