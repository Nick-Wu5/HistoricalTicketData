import React, { useState, useEffect } from "react";
import PriceChart from "./components/PriceChart";
import PriceStats from "./components/PriceStats";
import ChangeBadge from "./components/ChangeBadge";
import { fetchWidgetData } from "./api/client";

function App({ config }) {
  const [currentData, setCurrentData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventEnded, setEventEnded] = useState(false);

  const [metric, setMetric] = useState("avg");
  const [timeRange, setTimeRange] = useState("3day");

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
          mode: config.mode || "real",
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
  }, [config.eventId, timeRange, eventEnded]);

  // Format 24h change
  const formatChange = (value) => {
    if (value == null) return null;
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  // Loading state
  if (loading && !currentData) {
    return (
      <div className="olt-pricing-embed">
        <div className="olt-skeleton olt-skeleton-chart" />
      </div>
    );
  }

  // Error state
  if (error && !currentData) {
    return (
      <div className="olt-pricing-embed">
        <div className="olt-error">
          Unable to load pricing data.{" "}
          <a href={`https://onlylocaltickets.com/events/${config.eventId}`}>
            View tickets
          </a>
        </div>
      </div>
    );
  }

  const eventUrl =
    currentData?.olt_url ||
    `https://onlylocaltickets.com/events/${config.eventId}`;
  const eventTitle = currentData?.title || "Event";
  const changeValue = formatChange(currentData?.change_24h);
  const isPositiveChange = currentData?.change_24h >= 0;

  const formatEventDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  const eventDateTime = formatEventDate(currentData?.starts_at);

  return (
    <div className={`olt-pricing-embed theme-${config.theme || "light"}`}>
      {/* HEADER */}
      <header className="olt-header">
        <div className="olt-header-left">
          <div className="olt-title-row">
            <h2 className="olt-title">
              <a href={eventUrl} target="_blank" rel="noopener noreferrer">
                {eventTitle}
              </a>
            </h2>
            <ChangeBadge
              value={changeValue}
              isPositive={isPositiveChange}
              visibility="mobile"
            />
          </div>
          {eventDateTime && (
            <span className="olt-subtitle">{eventDateTime}</span>
          )}
        </div>

        <div className="olt-header-right">
          <ChangeBadge
            value={changeValue}
            isPositive={isPositiveChange}
            visibility="desktop"
          />
          <a
            href={eventUrl}
            className="olt-btn-primary olt-header-cta"
            target="_blank"
            rel="noopener noreferrer"
          >
            VIEW TICKETS
          </a>
        </div>
      </header>

      {/* Stats + controls */}
      <div className="olt-status-bar">
        <PriceStats
          min={currentData?.min_price}
          avg={currentData?.avg_price}
          max={currentData?.max_price}
          activeMetric={metric}
        />

        <div className="olt-controls">
          {/* Price Type Toggle */}
          <div
            className="olt-toggle-group olt-toggle-group--metric"
            data-active-index={metric === "min" ? 0 : metric === "avg" ? 1 : 2}
          >
            <span className="olt-toggle-pill" aria-hidden="true" />
            {["min", "avg", "max"].map((m) => (
              <button
                key={m}
                className="olt-toggle"
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                type="button"
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Date Range Toggle */}
          <div
            className="olt-toggle-group olt-toggle-group--range"
            data-active-index={timeRange === "3day" ? 0 : 1}
          >
            <span className="olt-toggle-pill" aria-hidden="true" />
            <button
              className="olt-toggle"
              onClick={() => setTimeRange("3day")}
              aria-pressed={timeRange === "3day"}
              type="button"
            >
              3 DAY
            </button>
            <button
              className="olt-toggle"
              onClick={() => setTimeRange("alltime")}
              aria-pressed={timeRange === "alltime"}
              type="button"
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="olt-chart">
        <PriceChart data={chartData} metric={metric} timeRange={timeRange} />
      </div>

      {/* Mobile CTA (hidden on desktop) */}
      <div className="olt-mobile-cta">
        <a
          href={eventUrl}
          className="olt-btn-primary"
          target="_blank"
          rel="noopener noreferrer"
        >
          VIEW TICKETS
        </a>
      </div>

      {/* Footer */}
      <footer className="olt-footer">
        <span className="olt-timestamp">
          Updated {new Date().toLocaleTimeString()}
        </span>
      </footer>

      {eventEnded && (
        <div className="olt-event-ended-notice">This event has ended</div>
      )}
    </div>
  );
}

export default App;
