import { TrackedEventsSearchForm } from './TrackedEventsSearchForm.jsx'
import { TrackedEventsResults } from './TrackedEventsResults.jsx'

export function TrackedEventsSection() {
  return (
    <div className="em-stack">
      <TrackedEventsSearchForm />
      <TrackedEventsResults />
    </div>
  )
}

