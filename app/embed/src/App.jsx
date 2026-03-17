import React, { useState, useEffect, useMemo } from "react";
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

  // Default to MIN: minimum price is the usual "starting at" quote for tickets.
  // Single source of truth here; no lazy init or effect—avoids any transient AVG render.
  const [metric, setMetric] = useState("min");
  const [timeRange, setTimeRange] = useState("3day");
  const fetchTimeRange = timeRange === "24h" ? "3day" : timeRange;

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
          timeRange: fetchTimeRange,
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
  }, [config.eventId, fetchTimeRange, eventEnded]);

  const displayedChartData = useMemo(() => {
    if (timeRange !== "24h") return chartData;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (chartData || []).filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [chartData, timeRange]);

  // Per-metric 24h change from backend (get_current_prices returns change_24h_min/avg/max).
  const change24hByMetric = {
    min: currentData?.change_24h_min ?? null,
    avg: currentData?.change_24h_avg ?? null,
    max: currentData?.change_24h_max ?? null,
  };

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

  // 24h badge reflects the selected metric (MIN/AVG/MAX).
  const selectedChange24h = change24hByMetric[metric];
  const changeValue = formatChange(selectedChange24h);
  const isPositiveChange = (selectedChange24h ?? 0) < 0;
  const isZeroChange = selectedChange24h === 0;
  const show24hNa = selectedChange24h == null;

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
              isZero={isZeroChange}
              visibility="mobile"
              showNa={show24hNa}
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
            isZero={isZeroChange}
            visibility="desktop"
            showNa={show24hNa}
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

      {/* Controls section: selectors row + subtle caption. */}
      <div className="olt-status-bar">
        <div className="olt-status-row">
          <PriceStats
            min={currentData?.min_price}
            avg={currentData?.avg_price}
            max={currentData?.max_price}
            activeMetric={metric}
            onMetricChange={setMetric}
          />

          <div className="olt-controls">
            {/* Date Range Toggle */}
            <div
              className="olt-toggle-group olt-toggle-group--range"
              data-active-index={timeRange === "24h" ? 0 : timeRange === "3day" ? 1 : 2}
            >
              <span className="olt-toggle-pill" aria-hidden="true" />
              <button
                className="olt-toggle"
                onClick={() => setTimeRange("24h")}
                aria-pressed={timeRange === "24h"}
                type="button"
              >
                24 HR
              </button>
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
      </div>

      {/* Chart */}
      <div className="olt-chart">
        <PriceChart data={displayedChartData} metric={metric} timeRange={timeRange} />
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
