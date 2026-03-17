export function ToggleField({ label, checked, disabled, onChange }) {
  const id = `em-toggle-${String(label).replaceAll(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="em-field">
      <div className="em-label">{label}</div>
      <div className="em-toggle-row">
        <input
          id={id}
          className="em-toggle-input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <label className="em-toggle" htmlFor={id} aria-disabled={disabled}>
          <span className="em-toggle-thumb" />
        </label>
        <div className="em-toggle-text">
          {checked ? 'Enabled' : 'Disabled'}
        </div>
      </div>
    </div>
  )
}

