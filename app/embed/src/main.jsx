/**
 * Historical Ticket Pricing Embed — Entry Point
 *
 * This module delegates to the bootstrap system for mount point detection
 * and initialization. The bootstrap module handles:
 * - Auto-discovery of [te-event-id] mount points
 * - Config parsing from dataset attributes
 * - Shadow DOM setup with scoped styles
 * - React app mounting
 *
 * The bootstrap system is the source of truth for the embed API.
 */

// Import bootstrap which auto-initializes on load
import "./bootstrap/index.jsx";

// For direct exports (if external scripts need them)
export {
  initializeWidgets,
  mount as manualMount,
  unmountAll,
} from "./bootstrap/index.jsx";
