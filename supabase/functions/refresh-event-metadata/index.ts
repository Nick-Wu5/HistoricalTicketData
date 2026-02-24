import { createClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "../../database.types.ts";
import { TicketEvolutionClient } from "@shared/te-api.ts";
import { buildOltEventUrl, type TeEvent } from "@shared/olt-url.ts";

const MAX_RETRIES = 3;
const EVENT_DURATION_HOURS = 4;

type RefreshRequest = {
  event_id?: number;
  te_event_ids?: number[];
  dry_run?: boolean;
};

type ExistingEventRow = {
  te_event_id: number;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  polling_enabled: boolean;
  olt_url: string | null;
};

type RefreshResult = {
  te_event_id: number;
  status: "updated" | "unchanged" | "error";
  changes?: string[];
  error?: string;
};

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastErr = error;
      const retryable = error.message.includes("429") ||
        error.message.includes("500") ||
        error.message.includes("502") ||
        error.message.includes("503") ||
        error.message.toLowerCase().includes("timeout");
      if (!retryable || attempt === maxRetries - 1) throw error;
      const delay = 1000 * Math.pow(2, attempt);
      console.log(
        `[refresh-event-metadata:${label}] retry ${attempt + 1}/${maxRetries} after ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

Deno.serve(async (req) => {
  const jsonHeaders = { "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RefreshRequest;
    const dryRun = body.dry_run ?? true;
    const queryEventIdRaw = new URL(req.url).searchParams.get("event_id");
    const queryEventId = queryEventIdRaw !== null
      ? Number.parseInt(queryEventIdRaw, 10)
      : null;
    const bodyEventId = body.event_id !== undefined && body.event_id !== null
      ? Number.parseInt(String(body.event_id), 10)
      : null;
    const singleEventId = Number.isFinite(queryEventId)
      ? queryEventId
      : (Number.isFinite(bodyEventId) ? bodyEventId : null);

    const requestedIdsFromArray = Array.isArray(body.te_event_ids)
      ? body.te_event_ids.filter((id) =>
        Number.isFinite(id) && Number.isInteger(id) && id > 0
      )
      : null;
    const requestedIds = Number.isFinite(singleEventId) && singleEventId! > 0
      ? [singleEventId!]
      : requestedIdsFromArray;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const teToken = Deno.env.get("TE_API_TOKEN")!;
    const teSecret = Deno.env.get("TE_API_SECRET")!;
    const teBaseUrl = Deno.env.get("TE_API_BASE_URL");

    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    const teClient = new TicketEvolutionClient(teToken, teSecret, teBaseUrl);

    let eventsQuery = supabase
      .from("events")
      .select(
        "te_event_id, title, starts_at, ends_at, ended_at, polling_enabled, olt_url",
      )
      .order("te_event_id", { ascending: true });

    if (requestedIds && requestedIds.length > 0) {
      eventsQuery = eventsQuery.in("te_event_id", requestedIds);
    }

    const { data: existingEvents, error: fetchEventsError } = await eventsQuery;
    if (fetchEventsError) {
      throw new Error(`Failed to fetch events: ${fetchEventsError.message}`);
    }

    const rows = (existingEvents ?? []) as ExistingEventRow[];
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const results: RefreshResult[] = [];

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    for (const row of rows) {
      const teEventId = row.te_event_id;
      try {
        const tePayload = await withRetry(
          () => teClient.get(`/events/${teEventId}`),
          String(teEventId),
        );
        const teEvent = (tePayload?.event ?? tePayload) as Record<
          string,
          unknown
        >;

        const title = asNullableString(teEvent?.name);
        const startsAt = asNullableString(teEvent?.occurs_at);
        if (!title || !startsAt) {
          throw new Error("TE event missing required fields: name/occurs_at");
        }

        const startMs = new Date(startsAt).getTime();
        if (Number.isNaN(startMs)) {
          throw new Error(`Invalid occurs_at timestamp: ${startsAt}`);
        }
        const endsAt = new Date(startMs + EVENT_DURATION_HOURS * 60 * 60 * 1000)
          .toISOString();
        const hasEnded = nowMs > new Date(endsAt).getTime();

        // Preserve manual disable for active events; auto-disable if ended.
        const nextPollingEnabled = hasEnded ? false : row.polling_enabled;
        // Never clear ended_at once set; set it when event first transitions to ended.
        const nextEndedAt = row.ended_at ?? (hasEnded ? nowIso : null);

        const titleChanged = row.title !== title;
        const startsAtChanged = row.starts_at !== startsAt;
        const endsAtChanged = row.ends_at !== endsAt;
        const shouldRegenerateOltUrl = !row.olt_url ||
          titleChanged ||
          startsAtChanged ||
          endsAtChanged;

        let nextOltUrl = row.olt_url;
        if (shouldRegenerateOltUrl) {
          // Fail-closed policy:
          // if URL regeneration is required and fails, mark this event as error
          // and skip ALL updates for this event.
          nextOltUrl = buildOltEventUrl(teEvent as TeEvent);
        }

        const changedFields: string[] = [];
        if (titleChanged) changedFields.push("title");
        if (startsAtChanged) changedFields.push("starts_at");
        if (endsAtChanged) changedFields.push("ends_at");
        if (row.polling_enabled !== nextPollingEnabled) {
          changedFields.push("polling_enabled");
        }
        if (row.ended_at !== nextEndedAt) changedFields.push("ended_at");
        if ((row.olt_url ?? null) !== (nextOltUrl ?? null)) {
          changedFields.push("olt_url");
        }

        if (changedFields.length === 0) {
          unchanged++;
          results.push({ te_event_id: teEventId, status: "unchanged" });
          continue;
        }

        if (!dryRun) {
          const updatePayload = {
            title,
            starts_at: startsAt,
            ends_at: endsAt,
            polling_enabled: nextPollingEnabled,
            ended_at: nextEndedAt,
            olt_url: nextOltUrl,
            updated_at: nowIso,
          } satisfies TablesUpdate<"events">;

          const { error: updateErr } = await supabase
            .from("events")
            .update(updatePayload)
            .eq("te_event_id", teEventId);

          if (updateErr) {
            throw new Error(`Update failed: ${updateErr.message}`);
          }
        }

        updated++;
        results.push({
          te_event_id: teEventId,
          status: "updated",
          changes: changedFields,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors++;
        results.push({ te_event_id: teEventId, status: "error", error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        mode: dryRun ? "dry_run" : "apply",
        requested_ids: requestedIds ?? "all",
        scanned: rows.length,
        updated,
        unchanged,
        errors,
        results,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ status: "failed", error: msg }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

