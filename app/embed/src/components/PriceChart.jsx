import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { isValidMetricValue } from "../utils/chartMetrics";

/**
 * PriceChart component wraps Recharts AreaChart to display historical pricing.
 * Uses optimized data interpolation for buttery-smooth morphing between metrics.
 *
 * Props:
 * - data: Array of { timestamp (ISO string), min_price, avg_price, max_price }
 * - metric: 'min' | 'avg' | 'max' - which line to display (default: 'min' - starting price)
 * - timeRange: '24h' | '3day' | 'alltime' - affects X-axis label format
 */

// Keep line/timeline animations controlled via a single duration constant so they feel aligned.
const METRIC_ANIMATION_DURATION_MS = 700;

// Lightweight mobile detection via matchMedia
const MOBILE_BREAKPOINT = "(max-width: 640px)";

function PriceChart({ data = [], metric = "min", timeRange = "3day" }) {
  // Track mobile viewport for responsive tick density
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
  });

  // Listen for viewport changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e) => setIsMobile(e.matches);
    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Legacy fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  // Map metric to data key
  const metricToKey = {
    min: "min_price",
    avg: "avg_price",
    max: "max_price",
  };
  const dataKey = metricToKey[metric] || metricToKey.min;

  // Compute Y-axis domain based on the currently selected metric only.
  // This avoids a single extreme (e.g. max_price) from compressing the MIN/AVG views.
  const targetYDomain = useMemo(() => {
    if (!data || data.length === 0) return [0, 100];

    const key = metricToKey[metric] || metricToKey.min;

    let min = Infinity;
    let max = -Infinity;

    for (const point of data) {
      const v = point[key];
      if (isValidMetricValue(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 100];
    }

    // Handle flat or near-flat series by adding a bit of padding
    if (min === max) {
      const pad = min === 0 ? 10 : Math.max(Math.abs(min) * 0.1, 1);
      return [min - pad, max + pad];
    }

    const range = max - min;
    // Guard against pathological tiny ranges
    const safeRange = range <= 0 ? Math.max(Math.abs(max), 1) : range;
    const step = Math.pow(10, Math.floor(Math.log10(safeRange))) / 2; // Nice step size
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;

    return [niceMin, niceMax];
  }, [data, metric]);

  // Derived chart data with a metric-specific display_price field.
  // We let Recharts handle the animation between datasets so metric + timeline toggles feel the same.
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point) => {
      const raw = point[dataKey];
      return {
        ...point,
        display_price: isValidMetricValue(raw) ? raw : null,
      };
    });
  }, [data, dataKey]);

  const parseTimestampForDisplay = (timestamp) => {
    if (typeof timestamp !== "string" || timestamp.length === 0) return null;
    // IMPORTANT: date-only strings (YYYY-MM-DD) are interpreted as UTC midnight by Date(),
    // which can shift to the previous day in local time. Use UTC midday to keep the
    // intended calendar day stable for display.
    if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
      const [y, m, d] = timestamp.split("-").map((n) => parseInt(n, 10));
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date : null;
  };

  // Chart colors (match --olt-brand-navy, --olt-brand-blue from tokens.css)
  const CHART_LINE_COLOR = "#2C356D";
  const GRADIENT_OPACITY_TOP = 0.15;
  const gradientId = "priceGradient";

  // Compute X-axis tick interval: fewer ticks on mobile to prevent overlap
  // Desktop: ~7 ticks, Mobile: ~4 ticks
  const xTickInterval = useMemo(() => {
    if (!data || data.length === 0) return 0;

    // Time-range-aware tick density:
    // - 24h: intraday market feel (more ticks on desktop, fewer on mobile)
    // - 3day: existing behavior
    // - alltime: fewer ticks by default
    let targetTicks;
    if (timeRange === "24h") {
      targetTicks = isMobile ? 4 : 8;
    } else if (timeRange === "3day") {
      targetTicks = isMobile ? 4 : 7;
    } else {
      targetTicks = isMobile ? 3 : 6;
    }

    return Math.max(1, Math.floor(data.length / targetTicks));
  }, [data, isMobile, timeRange]);

  // Format timestamp for X-axis
  const formatXAxis = (timestamp) => {
    const date = parseTimestampForDisplay(timestamp);
    if (!date) return "";
    if (timeRange === "24h") {
      // Intraday view: hour-of-day labels like "12 AM", "3 AM", "6 AM".
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      });
    } else if (timeRange === "3day") {
      // Show hour format for 3-day view
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      });
    } else {
      // Show date format for all-time view
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // Format price for Y-axis
  const formatYAxis = (value) => {
    return `$${Math.round(value)}`;
  };

  // Tooltip: Recharts can provide an empty payload when the hovered bucket has null/missing
  // values for the selected metric. In that case we still show a small \"N/A\" tooltip so the
  // UI doesn't look broken.
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active) return null;

    const point = payload?.[0]?.payload;
    const timestamp = point?.timestamp ?? label;
    const date = parseTimestampForDisplay(timestamp);

    const value = isValidMetricValue(point?.display_price)
      ? `$${Math.round(point.display_price)}`
      : "N/A";

    return (
      <div className="olt-chart-tooltip">
        {date && (
          <div className="olt-chart-tooltip-date">
            {date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        )}
        <div className="olt-chart-tooltip-row">
          <span className="olt-chart-tooltip-label">
            {metric.toUpperCase()}:
          </span>
          <span className="olt-chart-tooltip-value">{value}</span>
        </div>
        {point?.is_working_aggregate === true && (
          <div className="olt-chart-tooltip-row">
            <span className="olt-chart-tooltip-label">Working Aggregate</span>
          </div>
        )}
      </div>
    );
  };

  if (!data || data.length === 0 || chartData.length === 0) {
    return (
      <div
        className="olt-chart-wrapper"
        style={{ textAlign: "center", paddingTop: "60px" }}
      >
        <p style={{ color: "var(--olt-text-2)", fontSize: "14px" }}>
          No chart data available
        </p>
      </div>
    );
  }

  return (
    <div className="olt-chart-wrapper">
      {/* Height is controlled by CSS for responsive behavior:
          - Desktop: 280px
          - Mobile (≤480px): 200px
          Using 100% height lets CSS control the actual size */}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          // Extra bottom spacing prevents bottom-left X tick from colliding with the lowest Y tick.
          margin={{ top: 5, right: 10, left: 5, bottom: 12 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={CHART_LINE_COLOR}
                stopOpacity={GRADIENT_OPACITY_TOP}
              />
              <stop offset="95%" stopColor={CHART_LINE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(0,0,0,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            interval={xTickInterval}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            padding={{ left: 10, right: 10 }}
            tickMargin={4}
          />
          <YAxis
            domain={targetYDomain}
            tickCount={5}
            allowDecimals={false}
            tickFormatter={formatYAxis}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={55}
            tickMargin={4}
          />
          <Tooltip
            content={<CustomTooltip />}
            allowEscapeViewBox={{ x: true, y: true }}
            animationDuration={150}
            animationEasing="ease-out"
          />
          <Area
            type="monotone"
            dataKey="display_price"
            stroke={CHART_LINE_COLOR}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{
              r: 5,
              fill: CHART_LINE_COLOR,
              stroke: CHART_LINE_COLOR,
              strokeWidth: 2,
            }}
            connectNulls={false}
            isAnimationActive={true}
            animationDuration={METRIC_ANIMATION_DURATION_MS}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PriceChart;
