import { TextInput } from '../shared/TextInput.jsx'
import { Button } from '../shared/Button.jsx'

export function TrackedEventsSearchForm({
  teEventId,
  eventName,
  onTeEventIdChange,
  onEventNameChange,
  onSearch,
  loading = false,
}) {
  return (
    <form
      className="em-search-bar"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch?.()
      }}
    >
      <TextInput
        label="TE Event ID"
        placeholder="e.g. 2795412"
        value={teEventId}
        onChange={(e) => onTeEventIdChange?.(e.target.value)}
      />
      <TextInput
        label="Event Name"
        placeholder="Search title…"
        value={eventName}
        onChange={(e) => onEventNameChange?.(e.target.value)}
      />
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? 'Searching…' : 'Search'}
      </Button>
    </form>
  )
}

