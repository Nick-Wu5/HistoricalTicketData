import {
  runHourlyPollerCore,
  type SupabaseLike,
  type TeClientLike,
} from "../../supabase/functions/hourly-poller/core.ts";
import { VALID_LISTING } from "../helpers/mockTeClient.ts";
import { SequentialMockTeClient } from "../helpers/mockTeClient.ts";
import { MockSupabase } from "../helpers/mockSupabase.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

Deno.test("retry behavior: 503 then success", async () => {
  const now = new Date("2026-06-12T01:23:45.000Z");
  const frozenHourBucket = "2026-06-12T01:00:00.000Z";

  const eventsSeed = [
    {
      te_event_id: 2795400,
      title: "Retried Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
  ];

  const teClient = new SequentialMockTeClient({
    "2795400": [
      { _throw: "503 Service Unavailable" },
      { listings: [VALID_LISTING] },
    ],
  });

  const supabase = new MockSupabase(eventsSeed);

  const result = await runHourlyPollerCore({
    supabase: supabase as unknown as SupabaseLike,
    teClient: teClient as unknown as TeClientLike,
    now,
    hourBucket: frozenHourBucket,
    startTimeMs: now.getTime(),
  });

  assertEquals(result.events_total, 1);
  assertEquals(result.events_succeeded, 1);
  assertEquals(result.events_failed, 0);
  assertEquals(result.events_skipped, 0);
  assertEquals(result.status, "succeeded");
  assertEquals(teClient.calls.length, 2);

  const hourlyUpserts = supabase.eventPriceHourlyUpserts.filter(
    (r) => r.te_event_id === 2795400
  );
  assertEquals(hourlyUpserts.length, 1);
  assertEquals(supabase.pollerRunEventsUpserts.filter((r) => r.te_event_id === 2795400)[0].status, "succeeded");
});

Deno.test("retry behavior: 429 then success", async () => {
  const now = new Date("2026-06-12T01:23:45.000Z");
  const frozenHourBucket = "2026-06-12T01:00:00.000Z";

  const eventsSeed = [
    {
      te_event_id: 2795401,
      title: "RateLimited Event",
      polling_enabled: true,
      ends_at: "2026-06-13T00:00:00.000Z",
      ended_at: null,
      olt_url: null,
    },
  ];

  const teClient = new SequentialMockTeClient({
    "2795401": [
      { _throw: "429 Too Many Requests" },
      { listings: [VALID_LISTING] },
    ],
  });

  const supabase = new MockSupabase(eventsSeed);

  const result = await runHourlyPollerCore({
    supabase: supabase as unknown as SupabaseLike,
    teClient: teClient as unknown as TeClientLike,
    now,
    hourBucket: frozenHourBucket,
    startTimeMs: now.getTime(),
  });

  assertEquals(result.events_succeeded, 1);
  assertEquals(teClient.calls.length, 2);
  assertEquals(supabase.eventPriceHourlyUpserts.length, 1);
});
