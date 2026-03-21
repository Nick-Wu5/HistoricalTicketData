export function SectionHeader({ title, subtitle, rightActions = null, className = '' }) {
  return (
    <div className={['em-section-header', className].filter(Boolean).join(' ')}>
      <div className="em-section-header-top">
        <div className="em-section-title">{title}</div>
        {rightActions ? <div className="em-section-header-actions">{rightActions}</div> : null}
      </div>
      {subtitle ? <div className="em-section-subtitle">{subtitle}</div> : null}
    </div>
  )
}

