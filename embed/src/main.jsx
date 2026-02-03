import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import styles from './styles/embed.css?raw'

/**
 * Bootstrap script for the ticket pricing widget
 * This script:
 * 1. Finds all elements with id starting with "ticket-widget"
 * 2. Creates a Shadow DOM for style isolation
 * 3. Mounts the React app inside the Shadow DOM
 * 4. Passes event ID from data attributes
 */

function initializeWidget() {
  // Find all widget containers
  const containers = document.querySelectorAll('[id^="ticket-widget"]')
  
  containers.forEach((container) => {
    // Prevent double initialization
    if (container.shadowRoot) return

    // Get configuration from data attributes
    const eventId = container.dataset.eventId
    const theme = container.dataset.theme || 'light'
    
    if (!eventId) {
      console.error('TicketWidget: data-event-id is required')
      return
    }

    // Create Shadow DOM for style isolation
    const shadowRoot = container.attachShadow({ mode: 'open' })
    
    // Create a container div inside shadow DOM
    const appContainer = document.createElement('div')
    appContainer.id = 'widget-root'
    shadowRoot.appendChild(appContainer)

    // Inject styles into Shadow DOM
    const styleElement = document.createElement('style')
    styleElement.id = 'widget-styles'
    styleElement.innerHTML = styles
    shadowRoot.appendChild(styleElement)

    console.log(`TicketWidget: Initialized event ${eventId} with Shadow DOM styles (${styles.length} chars)`)

    // Mount React app
    const root = ReactDOM.createRoot(appContainer)
    root.render(
      <React.StrictMode>
        <App eventId={eventId} theme={theme} />
      </React.StrictMode>
    )
  })
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWidget)
} else {
  initializeWidget()
}

// Export for manual initialization if needed
export { initializeWidget }
