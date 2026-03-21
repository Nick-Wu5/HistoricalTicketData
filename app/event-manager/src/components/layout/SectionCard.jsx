export function SectionCard({ children, className = '' }) {
  return <section className={['em-card', className].filter(Boolean).join(' ')}>{children}</section>
}

