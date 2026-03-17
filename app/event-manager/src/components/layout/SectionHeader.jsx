export function SectionHeader({ title, subtitle }) {
  return (
    <div className="em-section-header">
      <div className="em-section-title">{title}</div>
      {subtitle ? <div className="em-section-subtitle">{subtitle}</div> : null}
    </div>
  )
}

