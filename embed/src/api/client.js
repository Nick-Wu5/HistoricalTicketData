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
 * - Current prices (min, avg, max, 24h change)
 * - Chart data (hourly for 3-day view, daily for all-time view)
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
 * @property {number} min_price
 * @property {number} avg_price
 * @property {number} max_price
 * @property {number} listing_count
 * @property {number} change_24h - Percentage change over 24 hours
 * @property {string} last_updated - ISO timestamp
 */

/**
 * @typedef {Object} ChartDataPoint
 * @property {string} timestamp - ISO timestamp (recorded_at or recorded_date)
 * @property {number} min_price
 * @property {number} avg_price
 * @property {number} max_price
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
    .select("te_event_id, title, olt_url, ends_at, ended_at, polling_enabled")
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
    change_24h: -5.2, // Negative = price dropped (good for buyers)
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
    const chartData =
      timeRange === "3day"
        ? await fetchChartDataHourly(teEventId)
        : await fetchChartDataDaily(teEventId);

    return {
      event,
      prices: prices || {
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        listing_count: 0,
        change_24h: 0,
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

/**
 * Fetch only chart data (for time range changes without refetching metadata).
 *
 * @param {Object} options
 * @param {string|number} options.eventId
 * @param {'3day'|'alltime'} options.timeRange
 * @param {'real'|'mock'} options.mode
 * @returns {Promise<ChartDataPoint[]>}
 */
export async function fetchChartData({
  eventId,
  timeRange = "3day",
  mode = "real",
}) {
  const teEventId =
    typeof eventId === "number" ? eventId : parseInt(eventId, 10);

  // Mock mode (also used when Supabase isn't configured)
  if (mode === "mock" || !SUPABASE_ANON_KEY) {
    return generateMockChartData(timeRange);
  }

  // Real mode requires valid numeric ID
  if (isNaN(teEventId)) {
    throw new Error(`Invalid event ID: ${eventId}`);
  }

  // Real mode
  return timeRange === "3day"
    ? fetchChartDataHourly(teEventId)
    : fetchChartDataDaily(teEventId);
}

/**
 * Build the "Buy Tickets" URL from event data.
 * Falls back to OLT search if olt_url is not available.
 *
 * @param {EventMetadata} event
 * @returns {string}
 */
export function getBuyTicketsUrl(event) {
  if (event.olt_url) {
    return event.olt_url;
  }
  // Fallback: search on OLT
  const searchQuery = encodeURIComponent(event.title || "");
  return `https://onlylocaltickets.com/search?q=${searchQuery}`;
}

/**
 * Check if the Supabase client is configured.
 * Useful for determining whether to show mock data warning.
 *
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_ANON_KEY);
}
