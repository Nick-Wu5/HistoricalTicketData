export function QueryModeHint() {
  return (
    <div className="em-hint">
      If <code>event_id</code> is provided, use Event/Show. Otherwise use Events/Index
      with only the provided params. <code>category_tree</code> is only valid when{' '}
      <code>category_id</code> is present.
    </div>
  )
}

