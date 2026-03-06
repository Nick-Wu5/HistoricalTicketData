import React from "react";

/**
 * 24h price change badge. Green for up, red for down.
 * When showNa is true (backend returned null for change_24h), show subtle "24h N/A".
 * Rendered twice in layout (mobile + desktop) with CSS controlling visibility.
 */
function ChangeBadge({ value, isPositive, visibility = "desktop", showNa = false }) {
  const visibilityClass =
    visibility === "mobile" ? "olt-change--mobile" : "olt-change--desktop";

  if (showNa) {
    return (
      <span
        className={`olt-change olt-change--na ${visibilityClass}`}
        aria-label="24 hour change not available"
      >
        <span className="olt-change-label">24h N/A</span>
      </span>
    );
  }

  if (value == null) return null;

  const directionClass = isPositive ? "olt-change--up" : "olt-change--down";

  return (
    <span
      className={`olt-change ${visibilityClass} ${directionClass}`}
      aria-label={`24 hour change: ${value}`}
    >
      <span className="olt-change-arrow">{isPositive ? "↑" : "↓"}</span>
      {value}
      <span className="olt-change-label">24h</span>
    </span>
  );
}

export default ChangeBadge;
