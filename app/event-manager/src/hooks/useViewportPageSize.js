import { useEffect, useState } from 'react'

const ROW_HEIGHT = 36
const CHROME_HEIGHT = 240
const MOBILE_BREAKPOINT = 720
const MOBILE_PAGE_SIZE = 10
const MIN_ROWS = 1
const MAX_ROWS = 40
const DEBOUNCE_MS = 150

function compute() {
  if (typeof window === 'undefined') return 15
  if (window.innerWidth <= MOBILE_BREAKPOINT) return MOBILE_PAGE_SIZE
  const available = window.innerHeight - CHROME_HEIGHT
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor(available / ROW_HEIGHT)))
}

/**
 * Returns a page-size tuned to viewport height.
 * Desktop: dynamically calculated, clamped to [1, 40] (tables also use internal scroll).
 * Mobile (≤720px): fixed at 10.
 * Recalculates on resize (debounced).
 */
export function useViewportPageSize() {
  const [pageSize, setPageSize] = useState(compute)

  useEffect(() => {
    let timer
    function onResize() {
      clearTimeout(timer)
      timer = setTimeout(() => setPageSize(compute()), DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return pageSize
}
