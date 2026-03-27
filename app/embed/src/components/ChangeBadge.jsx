import React from "react";

/**
 * Price change badge. Reflects the currently selected metric (min/avg/max) and
 * time range (24h/3d/All). Green for down (good for buyers), red for up.
 * When showNa is true (fewer than 2 valid points or zero baseline), shows
 * "<label> N/A". Rendered twice (mobile + desktop) with CSS visibility.
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
