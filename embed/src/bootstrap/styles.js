import tokensCss from "../styles/tokens.css?raw";
import componentsCss from "../styles/components.css?raw";
import embedCss from "../styles/embed.css?raw";

/**
 * Injects scoped styles into a Shadow DOM root.
 * Combines all CSS into a single <style> element to ensure consistency.
 *
 * @param {ShadowRoot} shadowRoot - The Shadow DOM root to inject styles into
 */
export function injectScopedStyles(shadowRoot) {
  const styleElement = document.createElement("style");
  styleElement.id = "olt-widget-styles";

  // Combine all CSS. Order matters:
  // 1. Tokens (CSS variables)
  // 2. Components (scoped styles)
  // 3. Embed overrides (legacy, for compatibility)
  const combinedCss = [tokensCss, componentsCss, embedCss].join("\n");

  styleElement.innerHTML = combinedCss;

  // Prepend styles so inline styles can override if needed
  shadowRoot.insertBefore(styleElement, shadowRoot.firstChild);
}

export default injectScopedStyles;
