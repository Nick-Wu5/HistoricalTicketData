import React from "react";

/**
 * 24h price change badge. Green for up, red for down.
 * Rendered twice in layout (mobile + desktop) with CSS controlling visibility.
 */
function ChangeBadge({ value, isPositive, visibility = "desktop" }) {
  if (value == null) return null;

  const visibilityClass =
    visibility === "mobile" ? "olt-change--mobile" : "olt-change--desktop";
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
