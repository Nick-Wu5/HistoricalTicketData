import { TicketEvolutionClient } from "@shared/te-api.ts";
import { requireAuth } from "@shared/auth.ts";

type ProxyRequest =
  | { mode: "show"; event_id: number }
  | {
    mode: "index";
    performer_id?: number;
    venue_id?: number;
    category_id?: number;
    category_tree?: boolean;
  };

type TeEventMinimal = {
  te_event_id: number;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
};

const jsonHeaders = { "Content-Type": "application/json" };
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...jsonHeaders, ...corsHeaders },
  });
}

function normalizeEvent(raw: Record<string, unknown>): TeEventMinimal | null {
  const teEventId = Number.parseInt(String(raw?.id ?? ""), 10);
  if (!Number.isFinite(teEventId) || teEventId <= 0) return null;
  return {
    te_event_id: teEventId,
    title: raw?.name ? String(raw.name) : "",
    starts_at: raw?.occurs_at ? String(raw.occurs_at) : null,
    ends_at: raw?.ends_at ? String(raw.ends_at) : null,
  };
}

function parseBody(body: unknown): ProxyRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const mode = b.mode;

  if (mode === "show") {
    const eventId = Number.parseInt(String(b.event_id ?? ""), 10);
    if (!Number.isFinite(eventId) || eventId <= 0) return null;
    return { mode: "show", event_id: eventId };
  }

  if (mode === "index") {
    const out: ProxyRequest = { mode: "index" };
    const performer = Number.parseInt(String(b.performer_id ?? ""), 10);
    const venue = Number.parseInt(String(b.venue_id ?? ""), 10);
    const category = Number.parseInt(String(b.category_id ?? ""), 10);

    if (Number.isFinite(performer) && performer > 0) out.performer_id = performer;
    if (Number.isFinite(venue) && venue > 0) out.venue_id = venue;
    if (Number.isFinite(category) && category > 0) out.category_id = category;
    if (typeof b.category_tree === "boolean") out.category_tree = b.category_tree;

    if (!out.performer_id && !out.venue_id && !out.category_id) return null;
    if (out.category_tree && !out.category_id) return null;
    return out;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...jsonHeaders, ...corsHeaders },
    });
  }

  try {
    const auth = await requireAuth(req, corsHeaders);
    if (!auth.authorized) return auth.response;

    const parsed = parseBody(await req.json().catch(() => null));
    if (!parsed) {
      return badRequest("Invalid payload. Use mode=show or mode=index with valid params.");
    }

    const teToken = Deno.env.get("TE_API_TOKEN")!;
    const teSecret = Deno.env.get("TE_API_SECRET")!;
    const teBaseUrl = Deno.env.get("TE_API_BASE_URL");
    const teClient = new TicketEvolutionClient(teToken, teSecret, teBaseUrl);

    if (parsed.mode === "show") {
      const response = await teClient.get(`/events/${parsed.event_id}`) as Record<string, unknown>;
      const eventRaw = (response?.event ?? response) as Record<string, unknown>;
      const event = normalizeEvent(eventRaw);
      return new Response(
        JSON.stringify({
          status: "ok",
          mode: "show",
          count: event ? 1 : 0,
          events: event ? [event] : [],
        }),
        { status: 200, headers: { ...jsonHeaders, ...corsHeaders } },
      );
    }

    const baseParams: Record<string, string> = { per_page: "100" };
    if (parsed.performer_id) baseParams.performer_id = String(parsed.performer_id);
    if (parsed.venue_id) baseParams.venue_id = String(parsed.venue_id);
    if (parsed.category_id) baseParams.category_id = String(parsed.category_id);
    if (typeof parsed.category_tree === "boolean") {
      baseParams.category_tree = parsed.category_tree ? "true" : "false";
    }

    const allEvents: TeEventMinimal[] = [];
    let page = 1;
    let totalEntries: number | null = null;
    const MAX_PAGES = 50;

    while (page <= MAX_PAGES) {
      const params = { ...baseParams, page: String(page) };
      const response = await teClient.get("/events", params) as Record<string, unknown>;

      const rows = Array.isArray(response?.events) ? response.events : [];
      const normalized = rows
        .map((row) => normalizeEvent((row ?? {}) as Record<string, unknown>))
        .filter((v): v is TeEventMinimal => Boolean(v));
      allEvents.push(...normalized);

      if (page === 1 && typeof response?.total_entries === "number") {
        totalEntries = response.total_entries as number;
      }

      const perPage = typeof response?.per_page === "number" ? (response.per_page as number) : 100;
      const hasMore = totalEntries !== null
        ? allEvents.length < totalEntries
        : rows.length >= perPage;

      if (!hasMore || rows.length === 0) break;
      page++;
    }

    console.log(`TE events index: fetched ${allEvents.length} events across ${page} page(s)` +
      (totalEntries !== null ? ` (total_entries: ${totalEntries})` : ""));

    return new Response(
      JSON.stringify({
        status: "ok",
        mode: "index",
        count: allEvents.length,
        totalEntries: totalEntries ?? allEvents.length,
        pagesFetched: page,
        events: allEvents,
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
