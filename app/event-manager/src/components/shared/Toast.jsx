import { useEffect, useState } from 'react'

const DURATION = 3000
const FADE = 300

/**
 * Fixed-position toast that auto-dismisses.
 * Reuses em-note semantic color classes (success, error, empty).
 * Render with message=null or message="" to hide.
 */
export function Toast({ message, variant = 'success', onDone }) {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!message) {
      setVisible(false)
      setFading(false)
      return
    }
    setVisible(true)
    setFading(false)
    const fadeTimer = setTimeout(() => setFading(true), DURATION)
    const removeTimer = setTimeout(() => {
      setVisible(false)
      setFading(false)
      onDone?.()
    }, DURATION + FADE)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [message, onDone])

  if (!visible || !message) return null

  const variantCls = variant === 'error'
    ? 'em-toast--error'
    : variant === 'empty'
      ? 'em-toast--empty'
      : 'em-toast--success'

  return (
    <div
      className={`em-toast ${variantCls}${fading ? ' em-toast--fading' : ''}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </div>
  )
}
