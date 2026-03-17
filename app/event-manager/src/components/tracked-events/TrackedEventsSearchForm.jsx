import { TextInput } from '../shared/TextInput.jsx'
import { Button } from '../shared/Button.jsx'

export function TrackedEventsSearchForm() {
  return (
    <form className="em-form" onSubmit={(e) => e.preventDefault()}>
      <div className="em-form-row">
        <TextInput label="TE Event ID" placeholder="e.g. 2795412" />
        <TextInput label="Event Name" placeholder="Search title…" />
      </div>
      <div className="em-form-actions">
        <Button type="submit" variant="primary">
          Search
        </Button>
        <Button type="button" variant="ghost">
          Clear
        </Button>
      </div>
    </form>
  )
}

