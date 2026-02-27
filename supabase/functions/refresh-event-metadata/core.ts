import type { TablesUpdate } from "../../database.types.ts";
import { buildOltEventUrl, type TeEvent } from "@shared/olt-url.ts";

const EVENT_DURATION_HOURS = 4;

type TeEventPayload = {
  name?: unknown;
  occurs_at?: unknown;
  venue?: unknown;
  category?: unknown;
  taxonomy?: unknown;
  timezone?: unknown;
};

function parseTeEvent(raw: unknown): { name: string; occurs_at: string; payload: TeEventPayload } {
  const p = raw as TeEventPayload;
  const name = p?.name != null && p.name !== "" ? String(p.name) : null;
  const occurs_at = p?.occurs_at != null && p.occurs_at !== "" ? String(p.occurs_at) : null;
  if (!name || !occurs_at) {
    throw new Error("TE event missing required fields: name/occurs_at");
  }
  const d = new Date(occurs_at);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid occurs_at timestamp: ${occurs_at}`);
  }
  return { name, occurs_at, payload: p };
}

export type ExistingEventRow = {
  te_event_id: number;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  polling_enabled: boolean;
  olt_url: string | null;
};

export type RefreshResult = {
  te_event_id: number;
  status: "updated" | "unchanged" | "error";
  changes?: string[];
  error?: string;
};

export type TeClientLike = {
  get: (path: string) => Promise<unknown>;
};

export type UpdateEventsFn = (
  teEventId: number,
  payload: TablesUpdate<"events">,
) => Promise<{ error: unknown }>;

export async function runRefreshMetadataCore(opts: {
  existingRows: ExistingEventRow[];
  teClient: TeClientLike;
  dryRun?: boolean;
  now?: Date;
  updateEvents?: UpdateEventsFn;
}): Promise<{
  scanned: number;
  updated: number;
  unchanged: number;
  errors: number;
  results: RefreshResult[];
}> {
  const {
    existingRows,
    teClient,
    dryRun = true,
    now = new Date(),
    updateEvents,
  } = opts;

  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const results: RefreshResult[] = [];
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const row of existingRows) {
    const teEventId = row.te_event_id;
    try {
      const tePayload = await teClient.get(`/events/${teEventId}`);
      const raw = (tePayload as Record<string, unknown>)?.event ?? tePayload;
      const { name: title, occurs_at: startsAt, payload: teEvent } = parseTeEvent(raw);

      const startMs = new Date(startsAt).getTime();
      const endsAt = new Date(
        startMs + EVENT_DURATION_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const hasEnded = nowMs > new Date(endsAt).getTime();

      const nextPollingEnabled = hasEnded ? false : row.polling_enabled;
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
        nextOltUrl = buildOltEventUrl({
          ...teEvent,
          id: teEventId,
          name: title,
          occurs_at: startsAt,
        } as TeEvent);
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

      if (!dryRun && updateEvents) {
        const updatePayload = {
          title,
          starts_at: startsAt,
          ends_at: endsAt,
          polling_enabled: nextPollingEnabled,
          ended_at: nextEndedAt,
          olt_url: nextOltUrl,
          updated_at: nowIso,
        } satisfies TablesUpdate<"events">;

        const { error: updateErr } = await updateEvents(teEventId, updatePayload);
        if (updateErr) {
          throw new Error(`Update failed: ${String(updateErr)}`);
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

  return {
    scanned: existingRows.length,
    updated,
    unchanged,
    errors,
    results,
  };
}
