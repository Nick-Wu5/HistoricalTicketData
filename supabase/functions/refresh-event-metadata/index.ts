import { createClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "../../database.types.ts";
import { TicketEvolutionClient } from "@shared/te-api.ts";
import {
  runRefreshMetadataCore,
  type ExistingEventRow,
} from "./core.ts";

const MAX_RETRIES = 3;

type RefreshRequest = {
  event_id?: number;
  te_event_ids?: number[];
  dry_run?: boolean;
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

    const wrappedTeClient = {
      get: (path: string) =>
        withRetry(() => teClient.get(path) as Promise<unknown>, path),
    };

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

    const updateEvents = async (
      teEventId: number,
      payload: TablesUpdate<"events">,
    ) => {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("te_event_id", teEventId);
      return { error };
    };

    const outcome = await runRefreshMetadataCore({
      existingRows: rows,
      teClient: wrappedTeClient,
      dryRun,
      updateEvents,
    });

    return new Response(
      JSON.stringify({
        status: "ok",
        mode: dryRun ? "dry_run" : "apply",
        requested_ids: requestedIds ?? "all",
        scanned: outcome.scanned,
        updated: outcome.updated,
        unchanged: outcome.unchanged,
        errors: outcome.errors,
        results: outcome.results,
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
