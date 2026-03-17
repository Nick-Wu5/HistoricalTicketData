export function PageShell({ title, children }) {
  return (
    <div className="em-page">
      <header className="em-header">
        <div className="em-header-inner">
          <div className="em-title">{title}</div>
          <div className="em-subtitle">Internal admin tool</div>
        </div>
      </header>
      <main className="em-main">{children}</main>
    </div>
  )
}

