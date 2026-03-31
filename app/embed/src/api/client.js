/**
 * API Client for Historical Ticket Pricing Embed
 *
 * This module provides a unified interface for fetching event pricing data.
 * It supports two modes:
 * - 'real': Connects to Supabase directly using @supabase/supabase-js
 * - 'mock': Returns mock data for development/testing
 *
 * The embed widget uses this client to fetch:
 * - Event metadata (title, olt_url, ends_at, ended_at)
 * - Current prices (min, avg, max, listing_count, last_updated, and per-metric 24h change fields)
 * - Chart data (hourly for 3-day view, daily for all-time view)
 * The badge in App is range-driven from chart data; change_24h_* fields remain available on current prices.
 */

import { createClient } from "@supabase/supabase-js";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Supabase configuration.
 * In production, these come from environment/build-time config.
 * The anon key is safe to expose (RLS protects the data).
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://tusmcdkrlzsakwbbqpvs.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// =============================================================================
// TYPES (JSDoc for IDE support)
// =============================================================================

/**
 * @typedef {Object} EventMetadata
 * @property {number} te_event_id
 * @property {string} title
 * @property {string|null} olt_url - OnlyLocalTickets URL for this event
 * @property {string|null} ends_at - ISO timestamp when event ends
 * @property {string|null} ended_at - ISO timestamp if event was manually ended
 * @property {boolean} polling_enabled
 */

/**
 * @typedef {Object} CurrentPrices
 * @property {number|null} min_price
 * @property {number|null} avg_price
 * @property {number|null} max_price
 * @property {number|null} listing_count
 * @property {number|null} change_24h_min - 24h percentage change for min price; null when no valid comparison
 * @property {number|null} change_24h_avg - 24h percentage change for avg price; null when no valid comparison
 * @property {number|null} change_24h_max - 24h percentage change for max price; null when no valid comparison
 * @property {string|null} last_updated - ISO timestamp
 */

/**
 * @typedef {Object} ChartDataPoint
 * @property {string} timestamp - ISO timestamp (recorded_at or recorded_date)
 * @property {number|null} min_price
 * @property {number|null} avg_price
 * @property {number|null} max_price
 * @property {boolean=} is_working_aggregate - True when this is a synthetic "today so far" point
 */

/**
 * @typedef {Object} WidgetData
 * @property {EventMetadata} event
 * @property {CurrentPrices} prices
 * @property {ChartDataPoint[]} chartData
 * @property {boolean} eventEnded
 */

// =============================================================================
// SUPABASE CLIENT (Singleton)
// =============================================================================

let supabaseClient = null;

/**
 * Get or create the Supabase client singleton.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabaseClient() {
  if (!supabaseClient && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // Embed doesn't need auth persistence
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

// =============================================================================
// REAL API IMPLEMENTATION
// =============================================================================

/**
 * Fetch event metadata from the events table.
 * @param {number} teEventId
 * @returns {Promise<EventMetadata|null>}
 */
async function fetchEventMetadata(teEventId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .from("events")
    .select(
      "te_event_id, title, olt_url, starts_at, ends_at, ended_at, polling_enabled",
    )
    .eq("te_event_id", teEventId)
    .single();

  if (error) {
    console.error("fetchEventMetadata error:", error);
    throw new Error(`Event not found: ${teEventId}`);
  }

  return data;
}

/**
 * Fetch current prices using the get_current_prices RPC function.
 * @param {number} teEventId
 * @returns {Promise<CurrentPrices|null>}
 */
async function fetchCurrentPrices(teEventId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase.rpc("get_current_prices", {
    p_te_event_id: teEventId,
  });

  if (error) {
    console.error("fetchCurrentPrices error:", error);
    throw new Error("Failed to fetch current prices");
  }

  // RPC returns an array; we want the first row
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Fetch hourly chart data for 3-day view.
 * @param {number} teEventId
 * @param {number} hoursBack - Default 72 (3 days)
 * @returns {Promise<ChartDataPoint[]>}
 */
async function fetchChartDataHourly(teEventId, hoursBack = 72) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase.rpc("get_chart_data_hourly", {
    p_te_event_id: teEventId,
    p_hours_back: hoursBack,
  });

  if (error) {
    console.error("fetchChartDataHourly error:", error);
    throw new Error("Failed to fetch hourly chart data");
  }

  // Transform to unified ChartDataPoint format
  return (data || []).map((row) => ({
    timestamp: row.recorded_at,
    min_price: row.min_price,
    avg_price: row.avg_price,
    max_price: row.max_price,
  }));
}

/**
 * Fetch daily chart data for all-time view.
 * @param {number} teEventId
 * @returns {Promise<ChartDataPoint[]>}
 */
async function fetchChartDataDaily(teEventId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase.rpc("get_chart_data_daily", {
    p_te_event_id: teEventId,
  });

  if (error) {
    console.error("fetchChartDataDaily error:", error);
    throw new Error("Failed to fetch daily chart data");
  }

  // Transform to unified ChartDataPoint format
  return (data || []).map((row) => ({
    timestamp: row.recorded_date,
    min_price: row.min_price,
    avg_price: row.avg_price,
    max_price: row.max_price,
  }));
}

/**
 * Threshold for switching from hourly to daily data in all-time view.
 * If less than this many days of daily data exist, use hourly instead.
 */
const ALL_TIME_DAILY_THRESHOLD = 7;
const ALL_TIME_WORKING_DAY_HOURS = 24;

function toMs(timestamp) {
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toUtcDayKey(timestamp) {
  if (typeof timestamp !== "string" || timestamp.length === 0) return null;
  // Preserve YYYY-MM-DD date-only values as-is to avoid timezone shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const ms = toMs(timestamp);
  if (ms == null) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function isFiniteMetricValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasAnyFiniteMetric(point) {
  if (!point || typeof point !== "object") return false;
  return (
    isFiniteMetricValue(point.min_price) ||
    isFiniteMetricValue(point.avg_price) ||
    isFiniteMetricValue(point.max_price)
  );
}

function computeWorkingDayAggregate(hourlyData) {
  if (!Array.isArray(hourlyData) || hourlyData.length === 0) return null;

  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayPoints = hourlyData.filter(
    (p) => toUtcDayKey(p?.timestamp) === todayUtc,
  );
  if (todayPoints.length === 0) return null;

  let minOfMin = null;
  let sumAvg = 0;
  let avgCount = 0;
  let maxOfMax = null;

  for (const p of todayPoints) {
    if (isFiniteMetricValue(p?.min_price)) {
      minOfMin = minOfMin == null ? p.min_price : Math.min(minOfMin, p.min_price);
    }
    if (isFiniteMetricValue(p?.avg_price)) {
      sumAvg += p.avg_price;
      avgCount += 1;
    }
    if (isFiniteMetricValue(p?.max_price)) {
      maxOfMax = maxOfMax == null ? p.max_price : Math.max(maxOfMax, p.max_price);
    }
  }

  const getLastValidMetric = (points, metricField) => {
    for (let i = points.length - 1; i >= 0; i--) {
      const value = points[i]?.[metricField];
      if (isFiniteMetricValue(value)) return value;
    }
    return null;
  };

  // If today's rows exist but all metrics are missing (e.g. no eligible listings),
  // carry forward the most recent valid hourly values so the "today so far" point
  // remains visible at daily density.
  if (minOfMin == null && avgCount === 0 && maxOfMax == null) {
    minOfMin = getLastValidMetric(hourlyData, "min_price");
    const fallbackAvg = getLastValidMetric(hourlyData, "avg_price");
    if (fallbackAvg != null) {
      sumAvg = fallbackAvg;
      avgCount = 1;
    }
    maxOfMax = getLastValidMetric(hourlyData, "max_price");
  }

  return {
    timestamp: todayUtc,
    min_price: minOfMin,
    avg_price: avgCount > 0 ? sumAvg / avgCount : null,
    max_price: maxOfMax,
    is_working_aggregate: true,
  };
}

function mergeDailyWithWorkingDayAggregate(dailyData, workingPoint) {
  if (!workingPoint) return Array.isArray(dailyData) ? dailyData : [];
  if (!Array.isArray(dailyData) || dailyData.length === 0) return [workingPoint];

  // If the working aggregate has no finite metric values, carry forward the most
  // recent valid daily values so "today so far" still renders as a visible point.
  let resolvedWorkingPoint = workingPoint;
  if (!hasAnyFiniteMetric(resolvedWorkingPoint)) {
    for (let i = dailyData.length - 1; i >= 0; i--) {
      const prior = dailyData[i];
      if (!hasAnyFiniteMetric(prior)) continue;
      resolvedWorkingPoint = {
        timestamp: workingPoint.timestamp,
        min_price: isFiniteMetricValue(prior.min_price) ? prior.min_price : null,
        avg_price: isFiniteMetricValue(prior.avg_price) ? prior.avg_price : null,
        max_price: isFiniteMetricValue(prior.max_price) ? prior.max_price : null,
        is_working_aggregate: true,
      };
      break;
    }
  }

  const todayUtc = toUtcDayKey(resolvedWorkingPoint.timestamp);
  const merged = dailyData.map((p) =>
    toUtcDayKey(p?.timestamp) === todayUtc ? resolvedWorkingPoint : p,
  );

  const hasToday = merged.some((p) => toUtcDayKey(p?.timestamp) === todayUtc);
  if (hasToday) return merged;
  return [...merged, resolvedWorkingPoint];
}

/**
 * Fetch chart data for all-time view with smart aggregation.
 * Uses hourly data if <7 days exist, daily otherwise.
 * @param {number} teEventId
 * @returns {Promise<ChartDataPoint[]>}
 */
async function fetchChartDataAllTime(teEventId) {
  // First, fetch daily data to check history length
  const dailyData = await fetchChartDataDaily(teEventId);

  // If we have enough daily data, use it
  if (dailyData.length >= ALL_TIME_DAILY_THRESHOLD) {
    const recentHourlyData = await fetchChartDataHourly(
      teEventId,
      ALL_TIME_WORKING_DAY_HOURS,
    );
    const workingPoint = computeWorkingDayAggregate(recentHourlyData);
    return mergeDailyWithWorkingDayAggregate(dailyData, workingPoint);
  }

  // Otherwise, fetch hourly data for better density
  // Use 168 hours (7 days) to ensure we capture all early history
  const hourlyData = await fetchChartDataHourly(teEventId, 168);

  // Return hourly if it has more data points, otherwise fall back to daily
  return hourlyData.length > dailyData.length ? hourlyData : dailyData;
}

/**
 * Check if an event has ended based on its metadata.
 * @param {EventMetadata} event
 * @returns {boolean}
 */
function checkEventEnded(event) {
  if (!event) return false;

  // Explicitly ended
  if (event.ended_at) return true;

  // Past end time
  if (event.ends_at) {
    const endsAt = new Date(event.ends_at);
    return endsAt < new Date();
  }

  return false;
}

// =============================================================================
// MOCK DATA (for development/testing)
// =============================================================================

/**
 * Generate mock chart data.
 * @param {'3day'|'alltime'} timeRange
 * @returns {ChartDataPoint[]}
 */
function generateMockChartData(timeRange) {
  const data = [];
  const points = timeRange === "3day" ? 72 : 30;
  const now = Date.now();
  const interval = timeRange === "3day" ? 3600000 : 86400000; // 1 hour or 1 day

  for (let i = points; i >= 0; i--) {
    const timestamp = new Date(now - i * interval);
    data.push({
      timestamp: timestamp.toISOString(),
      min_price: 100 + Math.random() * 50,
      avg_price: 250 + Math.random() * 100,
      max_price: 400 + Math.random() * 100,
    });
  }

  return data;
}

/**
 * Generate mock event metadata.
 * @param {string|number} eventId
 * @returns {EventMetadata}
 */
function generateMockEvent(eventId) {
  return {
    te_event_id:
      typeof eventId === "number" ? eventId : parseInt(eventId, 10) || 12345,
    title: "Lakers vs Celtics",
    olt_url: "https://onlylocaltickets.com/events/lakers-celtics",
    starts_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ended_at: null,
    polling_enabled: true,
  };
}

/**
 * Generate mock current prices.
 * @returns {CurrentPrices}
 */
function generateMockPrices() {
  return {
    min_price: 125,
    avg_price: 285,
    max_price: 450,
    listing_count: 1247,
    change_24h_min: -5.2,
    change_24h_avg: -3.1,
    change_24h_max: -2.0,
    last_updated: new Date().toISOString(),
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch all widget data in a single call.
 * This is the main entry point for the App component.
 *
 * @param {Object} options
 * @param {string|number} options.eventId - The TE event ID
 * @param {'3day'|'alltime'} options.timeRange - Chart time range
 * @param {'real'|'mock'} options.mode - API mode
 * @returns {Promise<WidgetData>}
 */
export async function fetchWidgetData({
  eventId,
  timeRange = "3day",
  mode = "real",
}) {
  // Parse eventId to number (TE event IDs are integers)
  const teEventId =
    typeof eventId === "number" ? eventId : parseInt(eventId, 10);

  // Mock mode for development (also used when Supabase isn't configured)
  // In mock mode, allow any eventId (including non-numeric strings)
  if (mode === "mock" || !SUPABASE_ANON_KEY) {
    const event = generateMockEvent(eventId);
    const prices = generateMockPrices();
    const chartData = generateMockChartData(timeRange);

    return {
      event,
      prices,
      chartData,
      eventEnded: checkEventEnded(event),
    };
  }

  // Real mode requires a valid numeric event ID
  if (isNaN(teEventId)) {
    throw new Error(`Invalid event ID: ${eventId}`);
  }

  // Real mode: fetch from Supabase
  try {
    // Fetch event metadata and current prices in parallel
    const [event, prices] = await Promise.all([
      fetchEventMetadata(teEventId),
      fetchCurrentPrices(teEventId),
    ]);

    if (!event) {
      throw new Error(`Event not found: ${teEventId}`);
    }

    // Check if event has ended before fetching chart data
    const eventEnded = checkEventEnded(event);

    // Fetch chart data based on time range
    // All-time view uses smart selection: hourly if <7 days, daily otherwise
    const chartData =
      timeRange === "3day"
        ? await fetchChartDataHourly(teEventId)
        : await fetchChartDataAllTime(teEventId);

    return {
      event,
      prices: prices || {
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        listing_count: 0,
        change_24h_min: null,
        change_24h_avg: null,
        change_24h_max: null,
        last_updated: new Date().toISOString(),
      },
      chartData,
      eventEnded,
    };
  } catch (error) {
    console.error("fetchWidgetData error:", error);
    throw error;
  }
}
