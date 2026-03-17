import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { injectScopedStyles } from "./styles";

/**
 * Configuration object parsed from a mount node's dataset attributes.
 * @typedef {Object} WidgetConfig
 * @property {string} eventId - The event ID (required)
 * @property {string} [baseUrl] - API base URL (optional; defaults to /api)
 * @property {string} [mode] - 'mock' or 'real' (optional; defaults to 'real')
 * @property {string} [theme] - 'light' or 'dark' (optional; defaults to 'light')
 */

/**
 * Parses attributes from a mount node.
 * Reads te-event-id attribute (NOT data-event-id for cleaner HTML).
 * Also reads data-base-url, data-mode, data-theme from dataset.
 *
 * @param {HTMLElement} node - The mount node
 * @returns {WidgetConfig} Parsed config
 */
function parseConfig(node) {
  // Primary: te-event-id attribute (cleaner HTML)
  // Fallback: data-event-id for backwards compatibility
  const eventId = node.getAttribute("te-event-id") || node.dataset.eventId;

  const { baseUrl = "/api", mode = "real", theme = "light" } = node.dataset;

  if (!eventId) {
    throw new Error(
      "TicketWidget: te-event-id is required on mount node. " +
        'Example: <div te-event-id="12345"></div>',
    );
  }

  return { eventId, baseUrl, mode, theme };
}

/**
 * Mounts a TicketWidget React app into a target element using Shadow DOM.
 * Creates an isolated scope for styles and component tree.
 *
 * @param {HTMLElement} target - The container element to mount into
 * @param {WidgetConfig} config - Configuration from dataset
 * @throws {Error} if target is not an HTMLElement
 */
function mount(target, config) {
  if (!target || !(target instanceof HTMLElement)) {
    console.error("TicketWidget.mount: target must be an HTMLElement", target);
    return;
  }

  // Check if already mounted
  if (target.shadowRoot) {
    console.warn(
      "TicketWidget: target already has a shadow root; skipping mount",
    );
    return;
  }

  try {
    // 1. Attach Shadow DOM (mode: 'open' allows external inspection for dev/debugging)
    const shadowRoot = target.attachShadow({ mode: "open" });

    // 2. Create app container
    const appContainer = document.createElement("div");
    appContainer.id = "olt-widget-root";
    appContainer.className = `olt-pricing-embed theme-${config.theme}`;
    shadowRoot.appendChild(appContainer);

    // 3. Inject scoped styles into Shadow DOM
    injectScopedStyles(shadowRoot);

    // 4. Mount React root
    const root = ReactDOM.createRoot(appContainer);
    root.render(
      <React.StrictMode>
        <App config={config} />
      </React.StrictMode>,
    );

    // Store config on element for later reference (if needed)
    target._widgetConfig = config;
    target._widgetRoot = root;
  } catch (error) {
    console.error("TicketWidget: failed to mount widget", error);
    // Attempt graceful fallback: show error message in target
    const fallback = document.createElement("div");
    fallback.style.cssText = `
      padding: 16px;
      border: 1px solid #e6e8ee;
      border-radius: 8px;
      background: #fef2f2;
      color: #991b1b;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
    `;
    fallback.textContent =
      "Unable to load ticket pricing widget. Please try refreshing the page.";
    target.appendChild(fallback);
  }
}

/**
 * Scans the document for mount points and initializes widgets.
 * Looks for elements with data-event-id attribute (any element type).
 *
 * Automatically called on script load (DOMContentLoaded or immediately if DOM is ready).
 * Can also be called manually if widgets are added dynamically.
 *
 * @param {Object} [options] - Optional initialization options
 * @param {string} [options.selector] - Custom CSS selector for mount points
 *                                      (defaults to '[data-event-id]')
 */
function initializeWidgets(options = {}) {
  // Primary selector: te-event-id attribute
  // Also check data-event-id for backwards compatibility
  const { selector = "[te-event-id], [data-event-id]" } = options;

  const containers = document.querySelectorAll(selector);

  if (containers.length === 0) {
    // No error; it's fine if there are no widgets on the page
    return;
  }

  containers.forEach((container) => {
    // Skip if already mounted
    if (container.shadowRoot) {
      return;
    }

    try {
      const config = parseConfig(container);
      mount(container, config);
    } catch (error) {
      console.error(
        "TicketWidget: initialization error on node",
        container,
        error,
      );
      // Continue with next node; don't break
    }
  });
}

/**
 * Manual mount function for programmatic use.
 * If you want to manually control mounting (not auto-init),
 * use this function with a target element.
 *
 * @example
 * const container = document.getElementById('my-widget')
 * TicketWidget.mount(container, { eventId: 'te_12345' })
 *
 * @param {HTMLElement} target - Element to mount into
 * @param {WidgetConfig} config - Widget configuration
 */
function manualMount(target, config) {
  if (!config.eventId) {
    throw new Error("TicketWidget.mount: config.eventId is required");
  }
  mount(target, config);
}

/**
 * Cleanup function to unmount all widgets.
 * Useful for testing or if widgets need to be destroyed.
 */
function unmountAll() {
  const mounted = document.querySelectorAll("[te-event-id], [data-event-id]");
  mounted.forEach((node) => {
    if (node.shadowRoot) {
      // Unmount React root if stored
      if (node._widgetRoot) {
        node._widgetRoot.unmount();
        delete node._widgetRoot;
      }
      node.shadowRoot.innerHTML = "";
    }
  });
}

/**
 * Auto-initialize on page load.
 * This runs immediately when the script is loaded.
 */
if (typeof window !== "undefined") {
  const init = () => {
    initializeWidgets();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

// Export public API
export { manualMount as mount, initializeWidgets, unmountAll };

// Also set up global namespace for convenience
if (typeof window !== "undefined") {
  window.TicketWidget = {
    mount: manualMount,
    initializeWidgets,
    unmountAll,
  };
}
