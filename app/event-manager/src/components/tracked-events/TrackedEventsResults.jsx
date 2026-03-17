import { EmptyState } from '../shared/EmptyState.jsx'

export function TrackedEventsResults() {
  return (
    <div className="em-results">
      <EmptyState
        title="Not wired yet"
        description="This will query the local Supabase events table and render a paginated table of results."
      />
    </div>
  )
}

