import { TEPreviewActions } from './TEPreviewActions.jsx'
import { TEPreviewResults } from './TEPreviewResults.jsx'

export function TEPreviewSection() {
  return (
    <div className="em-stack">
      <TEPreviewActions />
      <TEPreviewResults />
    </div>
  )
}

