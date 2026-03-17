export function EmptyState({ title, description }) {
  return (
    <div className="em-empty">
      <div className="em-empty-title">{title}</div>
      {description ? <div className="em-empty-desc">{description}</div> : null}
    </div>
  )
}

