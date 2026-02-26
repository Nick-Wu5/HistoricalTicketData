import {
  runHourlyPollerCore,
  type SupabaseLike,
  type TeClientLike,
} from "../supabase/functions/hourly-poller/core.ts";
import { MockSupabase } from "./helpers/mockSupabase.ts";
import { MockTeClient } from "./helpers/mockTeClient.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

Deno.test("skip disabled events", async () => {
  const now = new Date("2026-06-12T01:23:45.000Z");
  const frozenHourBucket = "2026-06-12T01:00:00.000Z";

  const eventsSeed = [
    {
      te_event_id: 2795400,
      title: "Disabled Event",
      polling_enabled: false,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
    {
      te_event_id: 2795401,
      title: "Enabled Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
  ];

  const supabase = new MockSupabase(eventsSeed);
  const teClient = new MockTeClient();

  const result = await runHourlyPollerCore({
    supabase: supabase as unknown as SupabaseLike,
    teClient: teClient as unknown as TeClientLike,
    now,
    hourBucket: frozenHourBucket,
    startTimeMs: now.getTime(),
  });

  // Enabled-only filtering should drive the poller workload size.
  assertEquals(result.events_total, 1);
  assertEquals(result.hour_bucket, frozenHourBucket);

  // TE should never be called for disabled events.
  assertEquals(teClient.calls.length, 1);
  assertEquals(teClient.calls[0].params.event_id, "2795401");

  // Hourly writes should only happen for enabled events.
  const hourlyWriteIds = supabase.eventPriceHourlyUpserts.map((r) =>
    r.te_event_id
  );
  assertEquals(hourlyWriteIds.includes(2795400), false);
  assertEquals(hourlyWriteIds.includes(2795401), true);

  // Current behavior: disabled events are filtered out before per-event logging.
  const runEventIds = supabase.pollerRunEventsUpserts.map((r) => r.te_event_id);
  assertEquals(runEventIds.includes(2795400), false);
  assertEquals(runEventIds.includes(2795401), true);

  // poller_runs counters should reflect filtered events only.
  const eventsTotalUpdate = supabase.pollerRunsUpdates.find((u) =>
    typeof u.events_total === "number"
  );
  assertEquals(eventsTotalUpdate?.events_total, 1);
});
