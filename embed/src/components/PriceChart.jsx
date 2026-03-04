import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * PriceChart component wraps Recharts LineChart to display historical pricing.
 *
 * Props:
 * - data: Array of { timestamp (ISO string), min_price, avg_price, max_price }
 * - metric: 'min' | 'avg' | 'max' - which line to display
 * - timeRange: '3day' | 'alltime' - affects X-axis label format
 */
function PriceChart({ data = [], metric = "avg", timeRange = "3day" }) {
  // Map metric to data key (API returns min_price, avg_price, max_price)
  const metricToKey = {
    min: "min_price",
    avg: "avg_price",
    max: "max_price",
  };

  const dataKey = metricToKey[metric] || metricToKey.avg;

  // Monochrome chart colors - single base color with opacity variations
  // Creates calm, analytical aesthetic; distinguishes lines without competing colors
  const metricColors = {
    min: "rgba(32, 48, 64, 0.4)", // 40% opacity - subtle
    avg: "rgba(32, 48, 64, 1)", // 100% opacity - primary
    max: "rgba(32, 48, 64, 0.6)", // 60% opacity - secondary
  };

  const lineColor = metricColors[metric] || metricColors.avg;

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
              ${Math.round(point[dataKey])}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
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
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(0,0,0,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            tickFormatter={formatYAxis}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: lineColor }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PriceChart;
