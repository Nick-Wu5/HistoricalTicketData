import React from "react";

/**
 * PriceStats — Stat bar that doubles as the metric selector.
 * Renders MIN/AVG/MAX as toggle-style segments: each shows price + label, is clickable,
 * and updates the chart metric. Styled like the timeline selector for consistency.
 *
 * Props:
 * - min, avg, max: number | null — price values
 * - activeMetric: 'min' | 'avg' | 'max' — selected metric (drives chart and active state)
 * - onMetricChange: (metric) => void — called when user selects a stat
 * - className: string — optional
 */
function PriceStats({
  min,
  avg,
  max,
  activeMetric,
  onMetricChange,
  className = "",
}) {
  const formatPrice = (price) => {
    if (price == null) return "—";
    return `$${Math.round(price)}`;
  };

  const stats = [
    { key: "min", value: min, label: "MIN" },
    { key: "avg", value: avg, label: "AVG" },
    { key: "max", value: max, label: "MAX" },
  ];

  const activeIndex = stats.findIndex((s) => s.key === activeMetric);
  const dataActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <div
      className={`olt-toggle-group olt-toggle-group--stat ${className}`.trim()}
      role="group"
      aria-label="Price metric"
      data-active-index={dataActiveIndex}
    >
      <span className="olt-toggle-pill" aria-hidden="true" />
      {stats.map(({ key, value, label }) => (
        <button
          key={key}
          type="button"
          className="olt-toggle olt-toggle--stat"
          onClick={() => onMetricChange(key)}
          aria-pressed={activeMetric === key}
        >
          <span className="olt-toggle-stat-price">{formatPrice(value)}</span>
          <span className="olt-toggle-stat-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default PriceStats;
