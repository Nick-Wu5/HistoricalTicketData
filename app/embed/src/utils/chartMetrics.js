/**
 * Shared helpers for chart-derived metric validation and computation.
 * Single source of truth: a metric value is valid iff it is a finite number.
 * null / undefined / NaN / Infinity are treated as missing (gap), never coerced to 0.
 */

export function isValidMetricValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function getMetricField(metric) {
  return metric === "avg"
    ? "avg_price"
    : metric === "max"
      ? "max_price"
      : "min_price";
}

/**
 * Returns the last valid value for `metricField` in the points array,
 * or null if no valid point exists.
 */
export function getLastValidMetricValue(points, metricField) {
  if (!Array.isArray(points)) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i]?.[metricField];
    if (isValidMetricValue(v)) return v;
  }
  return null;
}

/**
 * Returns { first, last } — the earliest and latest valid metric values
 * from the points array. Returns null if fewer than 2 valid points exist.
 */
export function getRangeEndpoints(points, metricField) {
  if (!Array.isArray(points) || points.length < 2) return null;

  let first = null;
  let last = null;

  for (const point of points) {
    const v = point?.[metricField];
    if (!isValidMetricValue(v)) continue;
    if (first === null) first = v;
    last = v;
  }

  if (first === null || last === null) return null;
  return { first, last };
}

/**
 * Percent change between the first and last valid metric values in the
 * visible dataset. Returns null when: fewer than 2 valid points, baseline
 * is 0, or all values are missing.
 */
export function computeRangePercentChange(points, metricField) {
  const endpoints = getRangeEndpoints(points, metricField);
  if (!endpoints || endpoints.first === 0) return null;
  return ((endpoints.last - endpoints.first) / endpoints.first) * 100;
}
