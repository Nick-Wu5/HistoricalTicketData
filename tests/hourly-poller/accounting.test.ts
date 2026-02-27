import {
  runHourlyPollerCore,
  type SupabaseLike,
  type TeClientLike,
} from "../../supabase/functions/hourly-poller/core.ts";
import { VALID_LISTING } from "../helpers/mockTeClient.ts";
import { ConfigurableMockTeClient } from "../helpers/mockTeClient.ts";
import { MockSupabase } from "../helpers/mockSupabase.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

Deno.test("succeeded/failed/skipped accounting", async () => {
  const now = new Date("2026-06-12T01:23:45.000Z");
  const frozenHourBucket = "2026-06-12T01:00:00.000Z";

  const eventsSeed = [
    {
      te_event_id: 2795400,
      title: "Succeeded Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
    {
      te_event_id: 2795401,
      title: "Skipped Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
    {
      te_event_id: 2795402,
      title: "Failed Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
  ];

  const teClient = new ConfigurableMockTeClient({
    "2795400": { listings: [VALID_LISTING] },
    "2795401": { listings: [] },
    "2795402": { _throw: "timeout" },
  });

  const supabase = new MockSupabase(eventsSeed);

  const result = await runHourlyPollerCore({
    supabase: supabase as unknown as SupabaseLike,
    teClient: teClient as unknown as TeClientLike,
    now,
    hourBucket: frozenHourBucket,
    startTimeMs: now.getTime(),
  });

  assertEquals(result.events_total, 3);
  assertEquals(result.events_succeeded, 1);
  assertEquals(result.events_failed, 1);
  assertEquals(result.events_skipped, 1);
  assertEquals(result.status, "partial");

  const succeededRow = supabase.pollerRunEventsUpserts.find(
    (r) => r.te_event_id === 2795400
  );
  assertEquals(succeededRow?.status, "succeeded");
  assertEquals(succeededRow?.error, null);
  assertEquals(succeededRow?.listing_count, 1);

  const skippedRow = supabase.pollerRunEventsUpserts.find(
    (r) => r.te_event_id === 2795401
  );
  assertEquals(skippedRow?.status, "skipped");
  assertEquals(skippedRow?.error, "no_eligible_listings");
  assertEquals(skippedRow?.listing_count, 0);

  const failedRow = supabase.pollerRunEventsUpserts.find(
    (r) => r.te_event_id === 2795402
  );
  assertEquals(failedRow?.status, "failed");
  assertEquals(failedRow?.error, "timeout");
  assertEquals(failedRow?.listing_count, null);

  const finalUpdate = supabase.pollerRunsUpdates.find(
    (u) => typeof u.events_succeeded === "number"
  );
  assertEquals(finalUpdate?.events_succeeded, 1);
  assertEquals(finalUpdate?.events_failed, 1);
  assertEquals(
    (finalUpdate?.debug as { skipped_count?: number })?.skipped_count,
    1
  );
});
