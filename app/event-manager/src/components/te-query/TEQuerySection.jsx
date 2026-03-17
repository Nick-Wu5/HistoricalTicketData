import { TEQueryForm } from './TEQueryForm.jsx'
import { QueryModeHint } from './QueryModeHint.jsx'

export function TEQuerySection() {
  return (
    <div className="em-stack">
      <QueryModeHint />
      <TEQueryForm />
    </div>
  )
}

