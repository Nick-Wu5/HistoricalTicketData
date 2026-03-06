import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * PriceChart component wraps Recharts AreaChart to display historical pricing.
 * Uses optimized data interpolation for buttery-smooth morphing between metrics.
 *
 * Props:
 * - data: Array of { timestamp (ISO string), min_price, avg_price, max_price }
 * - metric: 'min' | 'avg' | 'max' - which line to display
 * - timeRange: '3day' | 'alltime' - affects X-axis label format
 */

// Easing function outside component (no recreation)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Lightweight mobile detection via matchMedia
const MOBILE_BREAKPOINT = "(max-width: 640px)";

function PriceChart({ data = [], metric = "avg", timeRange = "3day" }) {
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
  const dataKey = metricToKey[metric] || metricToKey.avg;

  // Animation state
  const [animatedData, setAnimatedData] = useState([]);
  const animationRef = useRef(null);
  const startValuesRef = useRef(null);
  const endValuesRef = useRef(null);
  const baseDataRef = useRef(null); // Pre-allocated structure

  // Compute FIXED Y-axis domain across ALL metrics (prevents axis jitter)
  const yDomain = useMemo(() => {
    if (!data || data.length === 0) return [0, 100];

    let min = Infinity;
    let max = -Infinity;

    for (const point of data) {
      // Check all three metrics to get global min/max
      const values = [point.min_price, point.avg_price, point.max_price];
      for (const v of values) {
        if (v != null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }

    // Round to nice values for clean tick marks
    const range = max - min;
    const step = Math.pow(10, Math.floor(Math.log10(range))) / 2; // Nice step size
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;

    return [niceMin, niceMax];
  }, [data]);

  // Initialize base data structure (only when data changes)
  useEffect(() => {
    if (!data || data.length === 0) {
      setAnimatedData([]);
      baseDataRef.current = null;
      return;
    }

    // Create base structure once
    const base = data.map((point) => ({
      timestamp: point.timestamp,
      min_price: point.min_price,
      avg_price: point.avg_price,
      max_price: point.max_price,
      display_price: point[dataKey],
    }));

    baseDataRef.current = base;
    setAnimatedData(base);
  }, [data]);

  // Animate when metric changes
  useEffect(() => {
    // Cancel ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (!baseDataRef.current || baseDataRef.current.length === 0) return;
    if (animatedData.length === 0) return;

    // Capture start and end values in typed arrays for performance
    const len = animatedData.length;
    const startValues = new Float64Array(len);
    const endValues = new Float64Array(len);

    for (let i = 0; i < len; i++) {
      startValues[i] = animatedData[i].display_price;
      endValues[i] = data[i][dataKey];
    }

    startValuesRef.current = startValues;
    endValuesRef.current = endValues;

    const duration = 400; // ms
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      // Create new array with interpolated values (minimal allocation)
      const start = startValuesRef.current;
      const end = endValuesRef.current;
      const base = baseDataRef.current;

      const result = new Array(len);
      for (let i = 0; i < len; i++) {
        result[i] = {
          timestamp: base[i].timestamp,
          min_price: base[i].min_price,
          avg_price: base[i].avg_price,
          max_price: base[i].max_price,
          display_price: start[i] + (end[i] - start[i]) * eased,
        };
      }

      setAnimatedData(result);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    // Start animation on next frame
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [dataKey]); // Only re-run when metric changes

  // Chart colors (match --olt-brand-navy, --olt-brand-blue from tokens.css)
  const CHART_LINE_COLOR = "#2C356D";
  const GRADIENT_OPACITY_TOP = 0.15;
  const gradientId = "priceGradient";

  // Compute X-axis tick interval: fewer ticks on mobile to prevent overlap
  // Desktop: ~7 ticks, Mobile: ~4 ticks
  const xTickInterval = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const targetTicks = isMobile ? 4 : 7;
    return Math.max(1, Math.floor(data.length / targetTicks));
  }, [data, isMobile]);

  // Format timestamp for X-axis
  const formatXAxis = (timestamp) => {
    const date = new Date(timestamp);
    if (timeRange === "3day") {
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

  // Custom tooltip styled per OLT
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      const date = new Date(point.timestamp);

      return (
        <div className="olt-chart-tooltip">
          <div className="olt-chart-tooltip-date">
            {date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          <div className="olt-chart-tooltip-row">
            <span className="olt-chart-tooltip-label">
              {metric.toUpperCase()}:
            </span>
            <span className="olt-chart-tooltip-value">
              ${Math.round(point.display_price)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0 || animatedData.length === 0) {
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
          data={animatedData}
          margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
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
          />
          <YAxis
            domain={yDomain}
            tickCount={5}
            allowDecimals={false}
            tickFormatter={formatYAxis}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <Tooltip
            content={<CustomTooltip />}
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
            connectNulls={true}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PriceChart;
