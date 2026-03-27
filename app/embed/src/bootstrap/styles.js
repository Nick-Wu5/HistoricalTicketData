import tokensCss from "../styles/tokens.css?raw";
import componentsCss from "../styles/components.css?raw";

/**
 * Injects scoped styles into a Shadow DOM root.
 * Combines all CSS into a single <style> element to ensure consistency.
 *
 * @param {ShadowRoot} shadowRoot - The Shadow DOM root to inject styles into
 */
export function injectScopedStyles(shadowRoot) {
  const styleElement = document.createElement("style");
  styleElement.id = "olt-widget-styles";

  // Combine CSS in dependency order:
  // 1. Tokens (CSS variables)
  // 2. Components (scoped styles)
  const combinedCss = [tokensCss, componentsCss].join("\n");

  styleElement.innerHTML = combinedCss;

  // Prepend styles so inline styles can override if needed
  shadowRoot.insertBefore(styleElement, shadowRoot.firstChild);
}
