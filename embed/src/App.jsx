import React, { useState, useEffect } from "react";
import PriceChart from "./components/PriceChart";
import { fetchWidgetData } from "./api/client";

function App({ config }) {
  const [currentData, setCurrentData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventEnded, setEventEnded] = useState(false);

  // Chart controls
  const [metric, setMetric] = useState("avg");
  const [timeRange, setTimeRange] = useState("3day");

  // Check if event has ended
  const checkEventEnded = (data) => {
    if (!data) return false;
    if (data.ended_at) {
      return new Date(data.ended_at) < new Date();
    }
    if (data.ends_at) {
      return new Date(data.ends_at) < new Date();
    }
    return false;
  };

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    let pollInterval = null;

    async function loadData() {
      if (eventEnded) return;

      setLoading(true);
      setError(null);

      try {
        // fetchWidgetData returns { event, prices, chartData, eventEnded }
        const widgetData = await fetchWidgetData({
          eventId: config.eventId,
          timeRange,
        });

        if (cancelled) return;

        // Flatten event + prices into currentData for display
        setCurrentData({
          ...widgetData.event,
          ...widgetData.prices,
        });
        setChartData(widgetData.chartData);

        if (widgetData.eventEnded) {
          setEventEnded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load pricing data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    if (!eventEnded) {
      pollInterval = setInterval(loadData, 60000);
    }

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [config.eventId, timeRange, metric, eventEnded]);

  // Format price
  const formatPrice = (value) => {
    if (value == null) return "—";
    return `$${Math.round(value).toLocaleString()}`;
  };

  // Format 24h change
  const format24hChange = (value) => {
    if (value == null)
      return { text: "—", className: "olt-kpi-value--neutral" };
    const isDown = value < 0;
    const isUp = value > 0;
    const arrow = isDown ? "▼" : isUp ? "▲" : "";
    const sign = isUp ? "+" : "";
    const className = isDown
      ? "olt-kpi-value--down-good"
      : isUp
        ? "olt-kpi-value--up-bad"
        : "olt-kpi-value--neutral";
    return {
      text: `${arrow}${sign}${value.toFixed(1)}%`,
      className,
    };
  };

  // Loading state
  if (loading && !currentData) {
    return (
      <div className="olt-pricing-embed theme-light">
        <div className="olt-loading">
          <div className="olt-spinner"></div>
          <p>Loading pricing data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !currentData) {
    return (
      <div className="olt-pricing-embed theme-light">
        <div className="olt-error">
          <span className="olt-error-icon">⚠️</span>
          <p className="olt-error-message">{error}</p>
          <button
            className="olt-btn-retry"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const change24h = format24hChange(currentData?.change_24h);
  const eventUrl =
    currentData?.olt_url ||
    `https://onlylocaltickets.com/events/${config.eventId}`;
  const eventTitle = currentData?.title || "Event";

  // View Tickets button component (reused in header and mobile)
  const ViewTicketsButton = ({ className = "" }) => (
    <a
      href={eventUrl}
      className={`olt-btn-primary ${className}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      View Tickets
    </a>
  );

  return (
    <div className={`olt-pricing-embed theme-${config.theme || "light"}`}>
      {/* Event Header */}
      <div className="olt-event-header">
        <div className="olt-event-title-block">
          <h3 className="olt-event-title">
            <a href={eventUrl} target="_blank" rel="noopener noreferrer">
              {eventTitle}
            </a>
          </h3>
          <p className="olt-event-subtitle">Powered by OnlyLocalTickets</p>
        </div>
        {/* Desktop CTA - hidden on mobile via CSS */}
        <div className="olt-header-cta">
          <ViewTicketsButton />
        </div>
      </div>

      {/* Stats Bar */}
      <div className="olt-stats-bar">
        <div className="olt-stat">
          <span className="olt-stat-label">Min</span>
          <span className="olt-stat-value olt-stat-value--price">
            {formatPrice(currentData?.min_price)}
          </span>
        </div>
        <div className="olt-stat">
          <span className="olt-stat-label">Avg</span>
          <span className="olt-stat-value olt-stat-value--price">
            {formatPrice(currentData?.avg_price)}
          </span>
        </div>
        <div className="olt-stat">
          <span className="olt-stat-label">Max</span>
          <span className="olt-stat-value olt-stat-value--price">
            {formatPrice(currentData?.max_price)}
          </span>
        </div>
        <div className="olt-stat olt-stat--change">
          <span className="olt-stat-label">24h</span>
          <span className={`olt-stat-value ${change24h.className}`}>
            {change24h.text}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="olt-controls">
        <div className="olt-control-group">
          <span className="olt-control-group-label">Price:</span>
          <div className="olt-tabs" role="tablist" aria-label="Price metric">
            {["min", "avg", "max"].map((m) => (
              <button
                key={m}
                className="olt-tab"
                role="tab"
                aria-selected={metric === m}
                onClick={() => setMetric(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="olt-control-group">
          <span className="olt-control-group-label">Range:</span>
          <div className="olt-tabs" role="tablist" aria-label="Time range">
            <button
              className="olt-tab"
              role="tab"
              aria-selected={timeRange === "3day"}
              onClick={() => setTimeRange("3day")}
            >
              3 Days
            </button>
            <button
              className="olt-tab"
              role="tab"
              aria-selected={timeRange === "alltime"}
              onClick={() => setTimeRange("alltime")}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="olt-chart">
        <div className="olt-chart-wrapper">
          <PriceChart data={chartData} metric={metric} timeRange={timeRange} />
        </div>
      </div>

      {/* Mobile CTA - shown only on mobile, below chart */}
      <div className="olt-mobile-cta">
        <ViewTicketsButton />
      </div>

      {/* Footer */}
      <div className="olt-embed-footer">
        <p className="olt-embed-timestamp">
          Updated {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Event ended overlay */}
      {eventEnded && (
        <div className="olt-event-ended-notice">This event has ended</div>
      )}
    </div>
  );
}

export default App;
