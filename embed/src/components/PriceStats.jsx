import React from "react";

/**
 * PriceStats - Lightweight inline stats display
 *
 * Props:
 * - min: number - minimum price
 * - avg: number - average price
 * - max: number - maximum price
 * - activeMetric: 'min'|'avg'|'max' - currently selected metric (applies visual emphasis)
 * - className: string - optional additional class name
 */
function PriceStats({ min, avg, max, activeMetric, className = "" }) {
  const formatPrice = (price) => {
    if (price == null) return "—";
    return `$${Math.round(price)}`;
  };

  const stats = [
    { key: "min", value: min, label: "MIN" },
    { key: "avg", value: avg, label: "AVG" },
    { key: "max", value: max, label: "MAX" },
  ];

  return (
    <div className={`olt-stats ${className}`.trim()}>
      {stats.map(({ key, value, label }) => (
        <span
          key={key}
          className={`olt-stat-item ${activeMetric === key ? "olt-stat-item--active" : ""}`}
        >
          <span className="olt-stat-price">{formatPrice(value)}</span>
          <span className="olt-stat-label">{label}</span>
        </span>
      ))}
    </div>
  );
}

export default PriceStats;
