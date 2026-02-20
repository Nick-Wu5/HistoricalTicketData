import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import styles from './styles/embed.css?raw'

/**
 * Mounts the widget into a single container (Shadow DOM + React).
 * Use this for programmatic embedding.
 * @param {Object} options
 * @param {HTMLElement} options.target - Container element to mount into
 * @param {string} options.eventId - Event ID (required)
 * @param {string} [options.theme='light'] - 'light' | 'dark'
 */
function mount({ target, eventId, theme = 'light' }) {
  if (!target || !(target instanceof HTMLElement)) {
    console.error('TicketWidget.mount: target must be an HTMLElement')
    return
  }
  if (!eventId) {
    console.error('TicketWidget.mount: eventId is required')
    return
  }
  if (target.shadowRoot) {
    return // Already mounted
  }
  const shadowRoot = target.attachShadow({ mode: 'open' })
  const appContainer = document.createElement('div')
  appContainer.id = 'widget-root'
  shadowRoot.appendChild(appContainer)
  const styleElement = document.createElement('style')
  styleElement.id = 'widget-styles'
  styleElement.innerHTML = styles
  shadowRoot.appendChild(styleElement)
  const root = ReactDOM.createRoot(appContainer)
  root.render(
    <React.StrictMode>
      <App eventId={eventId} theme={theme} />
    </React.StrictMode>
  )
}

/**
 * Scans the document for elements with id starting with "ticket-widget"
 * and data-event-id, then mounts the widget in each (Shadow DOM).
 * Called automatically when the script loads.
 */
function initializeWidget() {
  const containers = document.querySelectorAll('[id^="ticket-widget"]')
  containers.forEach((container) => {
    if (container.shadowRoot) return
    const eventId = container.dataset.eventId
    const theme = container.dataset.theme || 'light'
    if (!eventId) {
      console.error('TicketWidget: data-event-id is required on', container)
      return
    }
    mount({ target: container, eventId, theme })
  })
}

// Auto-initialize when DOM is ready (only mounts into [id^="ticket-widget"] with data-event-id)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget)
} else {
  initializeWidget()
}

// Public API: window.TicketWidget after script load
export { initializeWidget, mount }
