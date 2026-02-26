import { aggregatePrices } from "../_shared/utils.ts";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

export type EventSelectionRow = {
  te_event_id: number;
  title: string;
  olt_url?: string | null;
  polling_enabled: boolean;
  ends_at?: string | null;
  ended_at?: string | null;
};

type EventRecord = Pick<EventSelectionRow, "te_event_id" | "title" | "olt_url">;

type ProcessEventResult = {
  te_event_id: number;
  status: "succeeded" | "failed" | "skipped";
  listing_count: number | null;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  error: string | null;
};

export type PollerSummary = {
  status: "succeeded" | "partial" | "failed";
  hour_bucket: string;
  events_total: number;
  events_processed: number;
  events_succeeded: number;
  events_failed: number;
  events_skipped: number;
  total_duration_ms: number;
};

export type TeClientLike = {
  get: (
    path: string,
    params: Record<string, string>,
  ) => Promise<{ ticket_groups?: unknown[]; listings?: unknown[] }>;
};

export type SupabaseLike = {
  from: (table: string) => unknown;
};

type DbError = { message: string; code?: string } | null;

type EventsTable = {
  select: (
    columns: string,
  ) => {
    order: (
      by: string,
    ) => Promise<{ data: EventSelectionRow[] | null; error: DbError }>;
  };
};

type EventPriceHourlyTable = {
  select: (
    columns: string,
  ) => {
    eq: (
      column: string,
      value: unknown,
    ) => {
      order: (
        by: string,
        options: { ascending: boolean },
      ) => {
        limit: (
          n: number,
        ) => {
          maybeSingle: () => Promise<{
            data: {
              min_price: number | null;
              avg_price: number | null;
              max_price: number | null;
              listing_count: number | null;
              captured_at_hour: string;
            } | null;
            error: DbError;
          }>;
        };
      };
    };
  };
  upsert: (
    row: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: DbError }>;
};

type PollerRunEventsTable = {
  upsert: (
    row: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: DbError }>;
};

type PollerRunsTable = {
  update: (
    row: Record<string, unknown>,
  ) => {
    eq: (
      column: string,
      value: unknown,
    ) => Promise<{ data: unknown; error: DbError }>;
  };
};

/**
 * Truncate timestamp to UTC hour bucket (YYYY-MM-DDTHH:00:00.000Z)
 */
export function truncateToHourUTC(date: Date): string {
  const d = new Date(date);
  d.setUTCMinutes(0);
  d.setUTCSeconds(0);
  d.setUTCMilliseconds(0);
  return d.toISOString();
}

function hashListings(listings: unknown[]): string {
  if (!listings || listings.length === 0) return "empty";

  const summary = listings
    .slice(0, 10)
    .map((l) => {
      const listing = l as { id?: unknown; retail_price?: unknown };
      return `${String(listing.id || "")}:${String(listing.retail_price || "")}`;
    })
    .join(",");

  let hash = 0;
  for (let i = 0; i < summary.length; i++) {
    const char = summary.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

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

      const isRetryable = err.message?.includes("429") ||
        err.message?.includes("500") ||
        err.message?.includes("502") ||
        err.message?.includes("503") ||
        err.message?.includes("timeout");

      if (!isRetryable || attempt === maxRetries - 1) {
        throw err;
      }

      const delay = 1000 * Math.pow(2, attempt);
      console.log(
        `[${eventTitle}] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function processEvent(
  event: EventRecord,
  hourBucket: string,
  teClient: TeClientLike,
  supabase: SupabaseLike,
): Promise<ProcessEventResult> {
  try {
    const response = await fetchWithRetry(
      () =>
        teClient.get(`/listings`, {
          event_id: String(event.te_event_id),
          type: "event",
        }),
      event.title,
    );

    const listings = response.ticket_groups ?? response.listings ?? [];
    const dataHash = hashListings(listings);
    console.log(
      `[${event.title}] Fetched ${listings.length} listings, data hash: ${dataHash}`,
    );

    const aggregates = aggregatePrices(
      listings as Parameters<typeof aggregatePrices>[0],
    );

    const eventPriceHourly = supabase.from("event_price_hourly") as EventPriceHourlyTable;
    const { data: previousHourData } = await eventPriceHourly
      .select("min_price, avg_price, max_price, listing_count, captured_at_hour")
      .eq("te_event_id", event.te_event_id)
      .order("captured_at_hour", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousHourData && previousHourData.captured_at_hour !== hourBucket) {
      const prevHour = previousHourData.captured_at_hour;
      const priceChanged = aggregates &&
        previousHourData.min_price !== null &&
        aggregates.min_price !== null &&
        Math.abs((previousHourData.min_price || 0) - (aggregates.min_price || 0)) >
          0.01;

      console.log(
        `[${event.title}] Previous hour (${prevHour}): min=$${previousHourData.min_price}, count=${previousHourData.listing_count}`,
      );

      if (aggregates) {
        console.log(
          `[${event.title}] Current hour (${hourBucket}): min=$${aggregates.min_price}, count=${aggregates.listing_count}`,
        );

        if (!priceChanged) {
          console.log(
            `[${event.title}] ⚠️  WARNING: Same aggregate prices as previous hour (${prevHour}).`,
          );
        }
      }
    }

    if (!aggregates) {
      const eventPriceHourlyRow = {
        te_event_id: event.te_event_id,
        captured_at_hour: hourBucket,
        listing_count: 0,
        min_price: null,
        avg_price: null,
        max_price: null,
      };

      const { error: upsertHourlyError } = await eventPriceHourly
        .upsert(eventPriceHourlyRow, { onConflict: "te_event_id,captured_at_hour" });

      if (upsertHourlyError) {
        throw new Error(`Failed to upsert hourly data: ${upsertHourlyError.message}`);
      }

      const pollerRunEventRow = {
        hour_bucket: hourBucket,
        te_event_id: event.te_event_id,
        status: "skipped",
        listing_count: 0,
        min_price: null,
        avg_price: null,
        max_price: null,
        error: "no_eligible_listings",
      };

      const pollerRunEvents = supabase.from("poller_run_events") as PollerRunEventsTable;
      await pollerRunEvents
        .upsert(pollerRunEventRow, { onConflict: "hour_bucket,te_event_id" });

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

    const eventPriceHourlyRow = {
      te_event_id: event.te_event_id,
      captured_at_hour: hourBucket,
      listing_count: aggregates.listing_count,
      min_price: aggregates.min_price,
      avg_price: aggregates.avg_price,
      max_price: aggregates.max_price,
    };

    const { error: upsertHourlyError } = await eventPriceHourly
      .upsert(eventPriceHourlyRow, { onConflict: "te_event_id,captured_at_hour" });

    if (upsertHourlyError) {
      throw new Error(`Failed to upsert hourly data: ${upsertHourlyError.message}`);
    }

    const pollerRunEventRow = {
      hour_bucket: hourBucket,
      te_event_id: event.te_event_id,
      status: "succeeded",
      listing_count: aggregates.listing_count,
      min_price: aggregates.min_price,
      avg_price: aggregates.avg_price,
      max_price: aggregates.max_price,
      error: null,
    };

    const pollerRunEvents = supabase.from("poller_run_events") as PollerRunEventsTable;
    await pollerRunEvents
      .upsert(pollerRunEventRow, { onConflict: "hour_bucket,te_event_id" });

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

    const pollerRunEventRow = {
      hour_bucket: hourBucket,
      te_event_id: event.te_event_id,
      status: "failed",
      listing_count: null,
      min_price: null,
      avg_price: null,
      max_price: null,
      error: error.message,
    };

    const pollerRunEvents = supabase.from("poller_run_events") as PollerRunEventsTable;
    await pollerRunEvents
      .upsert(pollerRunEventRow, { onConflict: "hour_bucket,te_event_id" });

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

async function processBatch(
  events: EventRecord[],
  hourBucket: string,
  teClient: TeClientLike,
  supabase: SupabaseLike,
): Promise<ProcessEventResult[]> {
  const results: ProcessEventResult[] = [];

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((event) => processEvent(event, hourBucket, teClient, supabase)),
    );

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

    const eventsProcessedSoFar = results.length;
    const pollerRuns = supabase.from("poller_runs") as PollerRunsTable;
    await pollerRuns
      .update({ events_processed: eventsProcessedSoFar })
      .eq("hour_bucket", hourBucket);
  }

  return results;
}

export async function runHourlyPollerCore(opts: {
  supabase: SupabaseLike;
  teClient: TeClientLike;
  now: Date;
  hourBucket?: string;
  startTimeMs?: number;
}): Promise<PollerSummary> {
  const { supabase, teClient, now } = opts;
  const hourBucket = opts.hourBucket ?? truncateToHourUTC(now);
  const startTime = opts.startTimeMs ?? Date.now();

  const eventsTable = supabase.from("events") as EventsTable;
  const { data: eventsRows, error: fetchEventsError } = await eventsTable
    .select("te_event_id, title, olt_url, polling_enabled, ends_at, ended_at")
    .order("title");

  if (fetchEventsError) {
    throw new Error(`Failed to fetch events: ${fetchEventsError.message}`);
  }

  const nowMs = now.getTime();
  const rows = (eventsRows ?? []) as EventSelectionRow[];
  const events = rows.filter((event) => {
    if (!event.polling_enabled) return false;
    if (event.ended_at) return false;
    if (!event.ends_at) return true;
    const endsAtMs = new Date(event.ends_at).getTime();
    if (Number.isNaN(endsAtMs)) return true;
    return endsAtMs > nowMs;
  }).map((event) => ({
      te_event_id: event.te_event_id,
      title: event.title,
      olt_url: event.olt_url ?? undefined,
    }));

  const pollerRuns = supabase.from("poller_runs") as PollerRunsTable;
  await pollerRuns
    .update({ events_total: events.length })
    .eq("hour_bucket", hourBucket);

  const retentionDebug = { mode: "daily_cron" };

  if (events.length === 0) {
    await pollerRuns
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        events_succeeded: 0,
        events_failed: 0,
        debug: {
          total_duration_ms: Date.now() - startTime,
          batches: 0,
          skipped_count: 0,
          retention: retentionDebug,
        },
      })
      .eq("hour_bucket", hourBucket);

    return {
      status: "succeeded",
      hour_bucket: hourBucket,
      events_total: 0,
      events_processed: 0,
      events_succeeded: 0,
      events_failed: 0,
      events_skipped: 0,
      total_duration_ms: Date.now() - startTime,
    };
  }

  const results = await processBatch(events, hourBucket, teClient, supabase);

  const eventsSucceeded = results.filter((r) => r.status === "succeeded").length;
  const eventsFailed = results.filter((r) => r.status === "failed").length;
  const eventsSkipped = results.filter((r) => r.status === "skipped").length;
  const totalDurationMs = Date.now() - startTime;

  const finalStatus: "succeeded" | "partial" | "failed" = eventsFailed === 0
    ? "succeeded"
    : (eventsSucceeded > 0 ? "partial" : "failed");
  const firstErrorMessage = results.find((r) => r.error)?.error ?? null;

  await pollerRuns
    .update({
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
        retention: retentionDebug,
      },
    })
    .eq("hour_bucket", hourBucket);

  return {
    status: finalStatus,
    hour_bucket: hourBucket,
    events_total: events.length,
    events_processed: results.length,
    events_succeeded: eventsSucceeded,
    events_failed: eventsFailed,
    events_skipped: eventsSkipped,
    total_duration_ms: totalDurationMs,
  };
}

