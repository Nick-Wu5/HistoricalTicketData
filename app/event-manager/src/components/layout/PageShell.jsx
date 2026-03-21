export function PageShell({ title, children, rightActions = null }) {
  return (
    <div className="em-page">
      <header className="em-header">
        <div className="em-header-inner">
          <div>
            <div className="em-title">{title}</div>
            <div className="em-subtitle">Internal admin tool</div>
          </div>
          {rightActions ? <div className="em-header-actions">{rightActions}</div> : null}
        </div>
      </header>
      <main className="em-main">{children}</main>
    </div>
  )
}

