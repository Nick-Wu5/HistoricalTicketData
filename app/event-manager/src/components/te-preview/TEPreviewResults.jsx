import { EmptyState } from '../shared/EmptyState.jsx'

export function TEPreviewResults() {
  return (
    <div className="em-results">
      <EmptyState
        title="Run a TE query"
        description="Results will appear here with an “Already Added” indicator computed from local Supabase events."
      />
    </div>
  )
}

