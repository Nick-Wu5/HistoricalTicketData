import React from "react";

/**
 * Price change badge. Reflects the currently selected metric and range.
 * Green for down (good for buyers), red for up. When showNa is true (no valid 24h comparison
 * for the selected metric), show "<label> N/A". Rendered twice (mobile + desktop) with CSS visibility.
 */
function ChangeBadge({
  value,
  isPositive,
  isZero = false,
  visibility = "desktop",
  showNa = false,
  label = "24h",
  ariaLabel = "price change",
}) {
  const visibilityClass =
    visibility === "mobile" ? "olt-change--mobile" : "olt-change--desktop";

  if (showNa) {
    return (
      <span
        className={`olt-change olt-change--na ${visibilityClass}`}
        aria-label={`${ariaLabel} not available`}
      >
        <span className="olt-change-label">{label} N/A</span>
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
      aria-label={`${ariaLabel}: ${value}`}
    >
      {value}
      <span className="olt-change-label">{label}</span>
    </span>
  );
}

export default ChangeBadge;
