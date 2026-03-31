import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@shared/auth.ts";
import { buildOltEventUrl } from "@shared/olt-url.ts";
import type { Database, TablesInsert } from "../../database.types.ts";

type AddEventsRequest = {
  selected_ids?: number[];
  te_events?: Record<string, unknown>[];
};

const EVENT_DURATION_HOURS = 4;
const jsonHeaders = { "Content-Type": "application/json" };
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseVenueLocation(location: unknown): { city?: string; state_code?: string } {
  if (!location || typeof location !== "string") return { city: undefined, state_code: undefined };
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length >= 2) return { city: parts[0], state_code: parts[1] };
  return { city: location.trim(), state_code: undefined };
}

function mapTeEventToInsertRow(teEvent: Record<string, unknown>): TablesInsert<"events"> | null {
  const title = teEvent?.name ? String(teEvent.name) : teEvent?.title ? String(teEvent.title) : null;
  const startsAt = teEvent?.occurs_at
    ? String(teEvent.occurs_at)
    : teEvent?.starts_at
      ? String(teEvent.starts_at)
      : null;
  const teEventId = Number.parseInt(String(teEvent?.id ?? teEvent?.te_event_id ?? ""), 10);
  if (!title || !startsAt || !Number.isFinite(teEventId) || teEventId <= 0) return null;

  const startMs = new Date(startsAt).getTime();
  if (Number.isNaN(startMs)) return null;

  const now = new Date();
  const endsAtDate = new Date(startMs + EVENT_DURATION_HOURS * 60 * 60 * 1000);
  const endsAt = endsAtDate.toISOString();
  const hasEnded = now.getTime() > endsAtDate.getTime();

  const venue = (teEvent?.venue ?? {}) as Record<string, unknown>;
  const fallback = parseVenueLocation(venue.location);
  const forUrl = {
    id: teEventId,
    name: title,
    occurs_at: startsAt,
    venue: {
      name: venue.name as string | undefined,
      city: (venue.city as string | undefined) || fallback.city,
      state_code:
        (venue.state_code as string | undefined) ||
        fallback.state_code ||
        (venue.state as string | undefined),
      state: venue.state as string | undefined,
    },
    category: teEvent?.category as Record<string, unknown> | undefined,
    taxonomy: teEvent?.taxonomy as Record<string, unknown> | undefined,
    timezone: (teEvent?.timezone as string | undefined) || (venue.time_zone as string | undefined),
  };

  let oltUrl: string | undefined;
  try {
    oltUrl = buildOltEventUrl(forUrl);
  } catch {
    oltUrl = undefined;
  }

  return {
    te_event_id: teEventId,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    polling_enabled: !hasEnded,
    ended_at: hasEnded ? now.toISOString() : null,
    updated_at: now.toISOString(),
    ...(oltUrl ? { olt_url: oltUrl } : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...jsonHeaders, ...corsHeaders },
    });
  }

  const auth = await requireAuth(req, corsHeaders);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as AddEventsRequest;
    const selectedIds = Array.from(
      new Set(
        (Array.isArray(body.selected_ids) ? body.selected_ids : [])
          .map((id) => Number.parseInt(String(id ?? ""), 10))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (selectedIds.length === 0) {
      return new Response(
        JSON.stringify({ added_count: 0, duplicate_count: 0, added_ids: [], duplicate_ids: [] }),
        { status: 200, headers: { ...jsonHeaders, ...corsHeaders } },
      );
    }

    const teEvents = Array.isArray(body.te_events) ? body.te_events : [];
    const teEventsById = new Map<number, Record<string, unknown>>();
    for (const event of teEvents) {
      const id = Number.parseInt(String(event?.id ?? event?.te_event_id ?? ""), 10);
      if (Number.isFinite(id) && id > 0) teEventsById.set(id, event);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

    const { data: existingRows, error: existingError } = await supabase
      .from("events")
      .select("te_event_id")
      .in("te_event_id", selectedIds);
    if (existingError) throw new Error(existingError.message);

    const existingIds = new Set(
      (existingRows ?? [])
        .map((row) => Number.parseInt(String(row?.te_event_id ?? ""), 10))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
    const duplicateIds = selectedIds.filter((id) => existingIds.has(id));
    const newIds = selectedIds.filter((id) => !existingIds.has(id));

    const rowsToInsert = newIds
      .map((id) => mapTeEventToInsertRow(teEventsById.get(id) ?? { te_event_id: id }))
      .filter((row): row is TablesInsert<"events"> => Boolean(row));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("events").insert(rowsToInsert);
      if (insertError) throw new Error(insertError.message);
    }

    const addedIds = rowsToInsert.map((row) => row.te_event_id);
    const addedCount = addedIds.length;
    const unmappableCount = Math.max(0, newIds.length - addedCount);
    const duplicateCount = duplicateIds.length + unmappableCount;

    return new Response(
      JSON.stringify({
        added_count: addedCount,
        duplicate_count: duplicateCount,
        added_ids: addedIds,
        duplicate_ids: duplicateIds,
      }),
      { status: 200, headers: { ...jsonHeaders, ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...jsonHeaders, ...corsHeaders },
    });
  }
});
