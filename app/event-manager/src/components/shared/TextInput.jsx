export function TextInput({ label, ...inputProps }) {
  const id = `em-${String(label).replaceAll(/\s+/g, '-').toLowerCase()}`
  return (
    <label className="em-field" htmlFor={id}>
      <div className="em-label">{label}</div>
      <input className="em-input" id={id} {...inputProps} />
    </label>
  )
}

