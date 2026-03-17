import React from "react";

/**
 * 24h price change badge. Reflects the currently selected metric (MIN/AVG/MAX).
 * Green for down (good for buyers), red for up. When showNa is true (no valid 24h comparison
 * for the selected metric), show "24h N/A". Rendered twice (mobile + desktop) with CSS visibility.
 */
function ChangeBadge({
  value,
  isPositive,
  isZero = false,
  visibility = "desktop",
  showNa = false,
}) {
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

  const directionClass = isZero
    ? "olt-change--neutral"
    : isPositive
      ? "olt-change--up"
      : "olt-change--down";

  return (
    <span
      className={`olt-change ${visibilityClass} ${directionClass}`}
      aria-label={`24 hour change: ${value}`}
    >
      {value}
      <span className="olt-change-label">24h</span>
    </span>
  );
}

export default ChangeBadge;
