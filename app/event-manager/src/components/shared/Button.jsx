export function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`em-btn em-btn--${variant} ${className}`} {...props} />
}

