import { createClient } from "@supabase/supabase-js";
import { TicketEvolutionClient } from "@shared/te-api.ts";
import { aggregatePrices } from "@shared/utils.ts";

// Configuration
const BATCH_SIZE = 5; // Process 5 events concurrently (reduced from 10)
const BATCH_DELAY_MS = 5000; // Wait 5 seconds between batches (increased from 1s)
const MAX_RETRIES = 3; // Retry failed requests up to 3 times

interface PollResult {
  event: string;
  status: "success" | "error" | "no_data" | "skipped";
  error?: string;
  duration_ms?: number;
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

/**
 * Process a single event
 */
type EventRecord = {
  id: string | number;
  te_event_id: string;
  title: string;
};

type InsertResult = PromiseLike<{ error: { message: string } | null }>;

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => InsertResult;
  };
};

async function processEvent(
  event: EventRecord,
  teClient: TicketEvolutionClient,
  supabase: SupabaseClientLike,
): Promise<PollResult> {
  const startTime = Date.now();

  try {
    // Fetch listings with retry logic (Using correct /listings endpoint)
    // Note: This endpoint does not support pagination and returns all listings
    const response = await fetchWithRetry(
      () => teClient.get(`/listings`, { event_id: event.te_event_id }),
      event.title,
    );

    // API returns 'ticket_groups' key (verified in debug)
    const listings = response.ticket_groups || response.listings || [];
    const aggregates = aggregatePrices(listings);

    if (aggregates) {
      const { error: insertError } = await supabase
        .from("event_price_hourly")
        .insert({
          event_id: event.id,
          timestamp: new Date().toISOString(),
          ...aggregates,
        });

      if (insertError) {
        console.error(`[${event.title}] Database insert error:`, insertError);
        return {
          event: event.title,
          status: "error",
          error: insertError.message,
          duration_ms: Date.now() - startTime,
        };
      }

      return {
        event: event.title,
        status: "success",
        duration_ms: Date.now() - startTime,
      };
    } else {
      console.log(`[${event.title}] No listings found`);
      return {
        event: event.title,
        status: "no_data",
        duration_ms: Date.now() - startTime,
      };
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[${event.title}] Error:`, error.message);
    return {
      event: event.title,
      status: "error",
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Process events in batches with controlled concurrency
 */
async function processBatch(
  events: EventRecord[],
  teClient: TicketEvolutionClient,
  supabase: SupabaseClientLike,
): Promise<PollResult[]> {
  const results: PollResult[] = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);

    console.log(
      `Processing batch ${batchNumber}/${totalBatches} (${batch.length} events)`,
    );

    // Process batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map((event) => processEvent(event, teClient, supabase)),
    );

    // Extract results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          event: "unknown",
          status: "error",
          error: result.reason?.message || "Unknown error",
        });
      }
    }

    // Rate limiting: wait between batches (except for last batch)
    if (i + BATCH_SIZE < events.length) {
      console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Main Edge Function handler
 */
Deno.serve(async (_req) => {
  const startTime = Date.now();

  try {
    // Environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const teToken = Deno.env.get("TE_API_TOKEN")!;
    const teSecret = Deno.env.get("TE_API_SECRET")!;

    // Initialize clients
    const supabase = createClient(supabaseUrl, supabaseKey);
    const teClient = new TicketEvolutionClient(teToken, teSecret);

    // Fetch events to poll
    const { data: eventsData, error: fetchError } = await supabase
      .from("events")
      .select("id, te_event_id, title")
      .order("title");

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    const events = (eventsData ?? []).map(
      (
        event: {
          id: string | number;
          te_event_id: string | number;
          title: string;
        },
      ) => ({
        id: event.id,
        te_event_id: String(event.te_event_id),
        title: event.title,
      }),
    );

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ message: "No events to poll" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`Starting poll for ${events.length} events...`);

    // Process events in batches
    const results = await processBatch(events, teClient, supabase);

    // Calculate statistics
    const totalDuration = Date.now() - startTime;
    const stats = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      no_data: results.filter((r) => r.status === "no_data").length,
      errors: results.filter((r) => r.status === "error").length,
      avg_duration_ms: Math.round(
        results.reduce((sum, r) => sum + (r.duration_ms || 0), 0) /
          results.length,
      ),
      total_duration_ms: totalDuration,
    };

    // Log summary
    console.log(JSON.stringify({
      type: "poll_complete",
      timestamp: new Date().toISOString(),
      ...stats,
    }));

    return new Response(
      JSON.stringify({
        message: "Polling complete",
        stats,
        results: results.filter((r) => r.status === "error"), // Only return errors for debugging
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(JSON.stringify({
      type: "poll_error",
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack,
    }));

    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
