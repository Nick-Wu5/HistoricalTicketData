export function QueryModeHint() {
  return (
    <div className="em-hint">
      If <code>event_id</code> is provided, fetch one event. Otherwise search by performer, venue,
      and/or category. <code>category_tree</code> is only valid when <code>category_id</code> is
      provided.
    </div>
  )
}

