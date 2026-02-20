import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  TablesInsert,
  TablesUpdate,
} from "../../database.types.ts";
import { TicketEvolutionClient } from "@shared/te-api.ts";
import { aggregatePrices } from "@shared/utils.ts";

// --- Configuration ---
const BATCH_SIZE = 10; // Events processed concurrently per batch
const MAX_RETRIES = 3; // Retries for transient TE API failures

// --- Database table names (for reference) ---
// events: Source of te_event_id, title, olt_url
// event_price_hourly: Price aggregates per (te_event_id, captured_at_hour)
// poller_runs: One row per hour bucket; lock + run status
// poller_run_events: Per-event run details (succeeded/failed/skipped)

/**
 * Truncate timestamp to UTC hour bucket (YYYY-MM-DDTHH:00:00.000Z)
 */
function truncateToHourUTC(date: Date): string {
  const d = new Date(date);
  d.setUTCMinutes(0);
  d.setUTCSeconds(0);
  d.setUTCMilliseconds(0);
  return d.toISOString();
}

/**
 * Generate a simple hash of listings data for comparison purposes.
 * Used to detect if API data actually changed between polls.
 */
function hashListings(listings: unknown[]): string {
  if (!listings || listings.length === 0) return "empty";

  // Create a simple hash based on listing IDs and prices
  const summary = listings
    .slice(0, 10) // Sample first 10 to avoid huge strings
    .map((l) => {
      const listing = l as { id?: unknown; retail_price?: unknown };
      return `${String(listing.id || "")}:${
        String(listing.retail_price || "")
      }`;
    })
    .join(",");

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < summary.length; i++) {
    const char = summary.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Retry wrapper with exponential backoff
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  eventTitle: string,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if error is retryable
      const isRetryable = err.message?.includes("429") || // Rate limit
        err.message?.includes("500") || // Server error
        err.message?.includes("502") || // Bad gateway
        err.message?.includes("503") || // Service unavailable
        err.message?.includes("timeout");

      if (!isRetryable || attempt === maxRetries - 1) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      console.log(
        `[${eventTitle}] Retry attempt ${
          attempt + 1
        }/${maxRetries} after ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

type EventRecord = {
  te_event_id: number;
  title: string;
  olt_url?: string;
};

type ProcessEventResult = {
  te_event_id: number;
  status: "succeeded" | "failed" | "skipped";
  listing_count: number | null;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  error: string | null;
};

/**
 * Process a single event: fetch TE listings, aggregate prices, write to
 * event_price_hourly and poller_run_events.
 */
async function processEvent(
  event: EventRecord,
  hourBucket: string,
  teClient: TicketEvolutionClient,
  supabase: SupabaseClient<Database>,
): Promise<ProcessEventResult> {
  try {
    // Fetch listings from TE API (with retry)
    const response = await fetchWithRetry(
      () =>
        teClient.get(`/listings`, {
          event_id: String(event.te_event_id),
          type: "event",
        }),
      event.title,
    );

    const listings = response.ticket_groups ?? response.listings ?? [];

    // Diagnostic: Log data hash to detect if API returned different data
    const dataHash = hashListings(listings);
    console.log(
      `[${event.title}] Fetched ${listings.length} listings, data hash: ${dataHash}`,
    );

    const aggregates = aggregatePrices(listings); // Filter + min/avg/max

    // Compare with previous hour's data (if available) for diagnostics
    const { data: previousHourData } = await supabase
      .from("event_price_hourly")
      .select(
        "min_price, avg_price, max_price, listing_count, captured_at_hour",
      )
      .eq("te_event_id", event.te_event_id)
      .order("captured_at_hour", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousHourData && previousHourData.captured_at_hour !== hourBucket) {
      const prevHour = previousHourData.captured_at_hour;
      const priceChanged = aggregates &&
        previousHourData.min_price !== null &&
        aggregates.min_price !== null &&
        Math.abs(
            (previousHourData.min_price || 0) - (aggregates.min_price || 0),
          ) > 0.01;

      console.log(
        `[${event.title}] Previous hour (${prevHour}): ` +
          `min=$${previousHourData.min_price}, count=${previousHourData.listing_count}`,
      );

      if (aggregates) {
        console.log(
          `[${event.title}] Current hour (${hourBucket}): ` +
            `min=$${aggregates.min_price}, count=${aggregates.listing_count}`,
        );

        if (!priceChanged) {
          console.log(
            `[${event.title}] ⚠️  WARNING: Same aggregate prices as previous hour ` +
              `(${prevHour}). This may indicate stale sandbox data or identical API response.`,
          );
        }
      }
    }

    if (!aggregates) {
      // Zero eligible listings: write NULLs for continuity (event_price_hourly)
      const eventPriceHourlyRow = {
        te_event_id: event.te_event_id,
        captured_at_hour: hourBucket,
        listing_count: 0,
        min_price: null,
        avg_price: null,
        max_price: null,
      } satisfies TablesInsert<"event_price_hourly">;

      const { error: upsertHourlyError } = await supabase
        .from("event_price_hourly")
        .upsert(
          eventPriceHourlyRow,
          { onConflict: "te_event_id,captured_at_hour" },
        );

      if (upsertHourlyError) {
        throw new Error(
          `Failed to upsert hourly data: ${upsertHourlyError.message}`,
        );
      }

      // Log skipped event (poller_run_events)
      const pollerRunEventRow = {
        hour_bucket: hourBucket,
        te_event_id: event.te_event_id,
        status: "skipped",
        listing_count: 0,
        min_price: null,
        avg_price: null,
        max_price: null,
        error: "no_eligible_listings",
      } satisfies TablesInsert<"poller_run_events">;

      const { error: logRunEventError } = await supabase
        .from("poller_run_events")
        .upsert(
          pollerRunEventRow,
          { onConflict: "hour_bucket,te_event_id" },
        );

      if (logRunEventError) {
        console.error(
          `[${event.title}] Failed to log skipped event:`,
          logRunEventError.message,
        );
      }

      return {
        te_event_id: event.te_event_id,
        status: "skipped",
        listing_count: 0,
        min_price: null,
        avg_price: null,
        max_price: null,
        error: "no_eligible_listings",
      };
    }

    // Upsert price aggregates (event_price_hourly)
    const eventPriceHourlyRow = {
      te_event_id: event.te_event_id,
      captured_at_hour: hourBucket,
      listing_count: aggregates.listing_count,
      min_price: aggregates.min_price,
      avg_price: aggregates.avg_price,
      max_price: aggregates.max_price,
    } satisfies TablesInsert<"event_price_hourly">;

    const { error: upsertHourlyError } = await supabase
      .from("event_price_hourly")
      .upsert(
        eventPriceHourlyRow,
        { onConflict: "te_event_id,captured_at_hour" },
      );

    if (upsertHourlyError) {
      throw new Error(
        `Failed to upsert hourly data: ${upsertHourlyError.message}`,
      );
    }

    // Log successful event (poller_run_events)
    const pollerRunEventRow = {
      hour_bucket: hourBucket,
      te_event_id: event.te_event_id,
      status: "succeeded",
      listing_count: aggregates.listing_count,
      min_price: aggregates.min_price,
      avg_price: aggregates.avg_price,
      max_price: aggregates.max_price,
      error: null,
    } satisfies TablesInsert<"poller_run_events">;

    const { error: logRunEventError } = await supabase
      .from("poller_run_events")
      .upsert(
        pollerRunEventRow,
        { onConflict: "hour_bucket,te_event_id" },
      );

    if (logRunEventError) {
      console.error(
        `[${event.title}] Failed to log event:`,
        logRunEventError.message,
      );
    }

    return {
      te_event_id: event.te_event_id,
      status: "succeeded",
      listing_count: aggregates.listing_count,
      min_price: aggregates.min_price,
      avg_price: aggregates.avg_price,
      max_price: aggregates.max_price,
      error: null,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[${event.title}] Error:`, error.message);

    // Log failed event (poller_run_events)
    const pollerRunEventRow = {
      hour_bucket: hourBucket,
      te_event_id: event.te_event_id,
      status: "failed",
      listing_count: null,
      min_price: null,
      avg_price: null,
      max_price: null,
      error: error.message,
    } satisfies TablesInsert<"poller_run_events">;

    const { error: logRunEventError } = await supabase
      .from("poller_run_events")
      .upsert(
        pollerRunEventRow,
        { onConflict: "hour_bucket,te_event_id" },
      );

    if (logRunEventError) {
      console.error(
        `[${event.title}] Failed to log error:`,
        logRunEventError.message,
      );
    }

    return {
      te_event_id: event.te_event_id,
      status: "failed",
      listing_count: null,
      min_price: null,
      avg_price: null,
      max_price: null,
      error: error.message,
    };
  }
}

/**
 * Process events in batches with controlled concurrency.
 * Updates poller_runs.events_processed after each batch.
 */
async function processBatch(
  events: EventRecord[],
  hourBucket: string,
  teClient: TicketEvolutionClient,
  supabase: SupabaseClient<Database>,
): Promise<ProcessEventResult[]> {
  const results: ProcessEventResult[] = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);

    console.log(
      `Processing batch ${batchNumber}/${totalBatches} (${batch.length} events)`,
    );

    // Process batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map((event) => processEvent(event, hourBucket, teClient, supabase)),
    );

    // Extract results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        const errorMsg = result.reason?.message || "Unknown error";
        results.push({
          te_event_id: 0,
          status: "failed",
          listing_count: null,
          min_price: null,
          avg_price: null,
          max_price: null,
          error: errorMsg,
        });
      }
    }

    // Update poller_runs.events_processed after each batch
    const eventsProcessedSoFar = results.length;
    const { error: updatePollerRunError } = await supabase
      .from("poller_runs")
      .update(
        { events_processed: eventsProcessedSoFar } satisfies TablesUpdate<
          "poller_runs"
        >,
      )
      .eq("hour_bucket", hourBucket);

    if (updatePollerRunError) {
      console.error(
        "Failed to update events_processed:",
        updatePollerRunError.message,
      );
    }
  }

  return results;
}

/**
 * Main Edge Function handler.
 * Flow: acquire lock → fetch events → process batches → update final status.
 */
Deno.serve(async (_req) => {
  const startTime = Date.now();
  const now = new Date();
  const hourBucket = truncateToHourUTC(now);

  try {
    // Environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const teToken = Deno.env.get("TE_API_TOKEN")!;
    const teSecret = Deno.env.get("TE_API_SECRET")!;
    const teBaseUrl = Deno.env.get("TE_API_BASE_URL"); // Optional: override API base URL

    // Diagnostic logging
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("HOURLY POLLER STARTING");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log(`Current UTC time: ${now.toISOString()}`);
    console.log(`Hour bucket: ${hourBucket}`);
    console.log(
      `API Base URL: ${
        teBaseUrl || "https://api.sandbox.ticketevolution.com/v9 (default)"
      }`,
    );
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );

    // Initialize clients
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    const teClient = new TicketEvolutionClient(teToken, teSecret, teBaseUrl);

    // Step 1: Acquire hourly lock (poller_runs)
    // Canonical pattern (Supabase JS): INSERT and treat unique-violation as "already running/ran".
    // Any non-conflict DB error is fatal. "Already ran" is only returned when the existing row is finished.
    const jsonHeaders = { "Content-Type": "application/json" };

    const newPollerRunRecord = {
      hour_bucket: hourBucket,
      status: "started",
      batch_size: BATCH_SIZE,
      events_processed: 0,
    } satisfies TablesInsert<"poller_runs">;

    const { error: lockAcquireError } = await supabase
      .from("poller_runs")
      .insert(newPollerRunRecord);

    if (lockAcquireError) {
      // Deterministic conflict detection: unique violation on hour_bucket
      const isConflict = lockAcquireError.code === "23505";
      if (!isConflict) {
        throw new Error(`Failed to acquire lock: ${lockAcquireError.message}`);
      }

      // True conflict: row already exists for this hour bucket.
      const { data: existingRun, error: readExistingErr } = await supabase
        .from("poller_runs")
        .select("hour_bucket, started_at, finished_at")
        .eq("hour_bucket", hourBucket)
        .maybeSingle();

      if (readExistingErr) {
        throw new Error(
          `Failed to read existing run row: ${readExistingErr.message}`,
        );
      }
      if (!existingRun) {
        throw new Error(
          `Lock conflict but run row missing for hour bucket ${hourBucket}`,
        );
      }

      // If the run is already finished, it truly already ran.
      if (existingRun.finished_at) {
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: "already_ran",
            hour_bucket: hourBucket,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }

      // Minimal stale-lock recovery:
      // if unfinished AND started_at < now - 15 minutes, mark stale + reclaim the lock.
      const staleCutoffIso = new Date(Date.now() - 15 * 60 * 1000)
        .toISOString();
      const nowIso = new Date().toISOString();

      const { data: recoveredRows, error: recoverErr } = await supabase
        .from("poller_runs")
        .update(
          {
            // Mark the previous in-flight attempt as stale/failed, but keep finished_at NULL
            // so a future invocation can recover again if this run dies too.
            status: "failed",
            error_sample: "stale_lock_timeout",
            started_at: nowIso,
            batch_size: BATCH_SIZE,
            events_processed: 0,
          } satisfies TablesUpdate<"poller_runs">,
        )
        .eq("hour_bucket", hourBucket)
        .is("finished_at", null)
        .lt("started_at", staleCutoffIso)
        .select("hour_bucket");

      if (recoverErr) {
        throw new Error(`Failed stale-lock recovery: ${recoverErr.message}`);
      }

      const didRecoverStaleLock = Array.isArray(recoveredRows) &&
        recoveredRows.length > 0 &&
        recoveredRows[0]?.hour_bucket === hourBucket;

      if (!didRecoverStaleLock) {
        // Not stale: another invocation is still running (or just started).
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: "already_running",
            hour_bucket: hourBucket,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }

      console.log(`Recovered stale lock for hour bucket: ${hourBucket}`);
    }

    // Insert succeeded => we acquired the lock
    console.log(`Acquired lock for hour bucket: ${hourBucket}`);

    // Step 2: Fetch events from database (events table)
    const { data: eventsRows, error: fetchEventsError } = await supabase
      .from("events")
      .select("te_event_id, title, olt_url")
      .order("title");

    if (fetchEventsError) {
      throw new Error(`Failed to fetch events: ${fetchEventsError.message}`);
    }

    const events = (eventsRows ?? []).map(
      (
        event: { te_event_id: number; title: string; olt_url?: string | null },
      ) => ({
        te_event_id: event.te_event_id,
        title: event.title,
        olt_url: event.olt_url ?? undefined,
      }),
    );

    // Update poller_runs.events_total (how many events we'll process)
    const { error: updateEventsTotalError } = await supabase
      .from("poller_runs")
      .update(
        { events_total: events.length } satisfies TablesUpdate<"poller_runs">,
      )
      .eq("hour_bucket", hourBucket);

    if (updateEventsTotalError) {
      console.error(
        "Failed to update events_total:",
        updateEventsTotalError.message,
      );
    }

    if (events.length === 0) {
      // No events: mark run as succeeded and return early
      const { error: finishRunError } = await supabase
        .from("poller_runs")
        .update(
          {
            status: "succeeded",
            finished_at: new Date().toISOString(),
            events_succeeded: 0,
            events_failed: 0,
          } satisfies TablesUpdate<"poller_runs">,
        )
        .eq("hour_bucket", hourBucket);

      if (finishRunError) {
        console.error(
          "Failed to mark run as succeeded:",
          finishRunError.message,
        );
      }

      return new Response(
        JSON.stringify({
          status: "succeeded",
          hour_bucket: hourBucket,
          message: "No events to poll",
          events_total: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Starting poll for ${events.length} events...`);

    // Step 3: Process events in batches
    const results = await processBatch(events, hourBucket, teClient, supabase);

    // Step 4: Calculate final statistics from results
    const eventsSucceeded = results.filter((r) =>
      r.status === "succeeded"
    ).length;
    const eventsFailed = results.filter((r) => r.status === "failed").length;
    const eventsSkipped = results.filter((r) => r.status === "skipped").length;
    const totalDurationMs = Date.now() - startTime;

    // Determine final run status (poller_runs.status)
    let finalStatus: "succeeded" | "partial" | "failed";
    if (eventsFailed === 0) {
      finalStatus = "succeeded";
    } else if (eventsSucceeded > 0) {
      finalStatus = "partial";
    } else {
      finalStatus = "failed";
    }

    // First error message for error_sample (for debugging)
    const firstErrorMessage = results.find((r) => r.error)?.error ?? null;

    // Step 5: Update poller_runs with final status and stats
    const { error: finishRunError } = await supabase
      .from("poller_runs")
      .update(
        {
          status: finalStatus,
          finished_at: new Date().toISOString(),
          events_processed: results.length,
          events_succeeded: eventsSucceeded,
          events_failed: eventsFailed,
          error_sample: firstErrorMessage,
          debug: {
            total_duration_ms: totalDurationMs,
            batches: Math.ceil(events.length / BATCH_SIZE),
            skipped_count: eventsSkipped,
          },
        } satisfies TablesUpdate<"poller_runs">,
      )
      .eq("hour_bucket", hourBucket);

    if (finishRunError) {
      console.error("Failed to update final status:", finishRunError.message);
    }

    // Diagnostic summary
    console.log(
      "\n═══════════════════════════════════════════════════════════════",
    );
    console.log("POLLER RUN COMPLETE");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log(`Hour bucket: ${hourBucket}`);
    console.log(`Events processed: ${results.length}`);
    console.log(`  ✓ Succeeded: ${eventsSucceeded}`);
    console.log(`  ✗ Failed: ${eventsFailed}`);
    console.log(`  ⊘ Skipped: ${eventsSkipped}`);
    console.log(`Total duration: ${totalDurationMs}ms`);
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );

    // Return summary response
    return new Response(
      JSON.stringify({
        status: finalStatus,
        hour_bucket: hourBucket,
        events_total: events.length,
        events_processed: results.length,
        events_succeeded: eventsSucceeded,
        events_failed: eventsFailed,
        events_skipped: eventsSkipped,
        total_duration_ms: totalDurationMs,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Try to mark poller_runs row as failed (best-effort)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient<Database>(supabaseUrl, supabaseKey);

      await supabase
        .from("poller_runs")
        .update(
          {
            status: "failed",
            finished_at: new Date().toISOString(),
            error_sample: err.message,
          } satisfies TablesUpdate<"poller_runs">,
        )
        .eq("hour_bucket", hourBucket);
    } catch (updatePollerRunErr) {
      console.error(
        "Failed to update run status on error:",
        updatePollerRunErr,
      );
    }

    console.error(JSON.stringify({
      type: "poll_error",
      timestamp: new Date().toISOString(),
      hour_bucket: hourBucket,
      error: err.message,
      stack: err.stack,
    }));

    return new Response(
      JSON.stringify({
        status: "failed",
        hour_bucket: hourBucket,
        error: err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
