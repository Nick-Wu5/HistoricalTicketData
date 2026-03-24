import { useState } from 'react'

export function TruncatedCell({ text, variant }) {
  const [expanded, setExpanded] = useState(false)
  if (text === '—') return text

  const variantCls = variant === 'url'
    ? 'em-cell-truncate--url'
    : variant === 'title'
      ? 'em-cell-truncate--title'
      : ''
  const baseCls = `em-cell-truncate${variantCls ? ` ${variantCls}` : ''}`
  const cls = expanded ? `${baseCls} em-cell-truncate--expanded` : baseCls

  return (
    <span
      className={cls}
      title={!expanded ? text : undefined}
      onClick={() => setExpanded((v) => !v)}
    >
      {text}
    </span>
  )
}
