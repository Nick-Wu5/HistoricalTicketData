import {
  runRefreshMetadataCore,
  type ExistingEventRow,
  type TeClientLike,
} from "../../supabase/functions/refresh-event-metadata/core.ts";
import { MockTeEventsClient } from "../helpers/mockTeEvents.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

const FUTURE_OCCURS_AT = "2027-06-15T19:00:00.000Z";
const PAST_OCCURS_AT = "2020-06-15T19:00:00.000Z";

Deno.test("metadata: update changed title/time", async () => {
  const existing: ExistingEventRow[] = [
    {
      te_event_id: 2795400,
      title: "Old Title",
      starts_at: "2027-06-14T19:00:00.000Z",
      ends_at: "2027-06-14T23:00:00.000Z",
      ended_at: null,
      polling_enabled: true,
      olt_url: "https://example.com/old",
    },
  ];

  const teClient = new MockTeEventsClient({
    2795400: {
      name: "New Title",
      occurs_at: "2027-06-16T20:00:00.000Z",
      venue: { city: "LA", state_code: "CA", name: "Staples" },
      category: { short_name: "sports" },
    },
  });

  const outcome = await runRefreshMetadataCore({
    existingRows: existing,
    teClient,
    dryRun: true,
    now: new Date("2026-06-01T00:00:00.000Z"),
  });

  assertEquals(outcome.scanned, 1);
  assertEquals(outcome.updated, 1);
  assertEquals(outcome.errors, 0);
  const r = outcome.results[0];
  assertEquals(r.status, "updated");
  assertEquals(r.changes?.includes("title"), true);
  assertEquals(r.changes?.includes("starts_at"), true);
  assertEquals(r.changes?.includes("ends_at"), true);
  assertEquals(r.changes?.includes("olt_url"), true);
});

Deno.test("metadata: unchanged when all fields match TE", async () => {
  const startsAt = FUTURE_OCCURS_AT;
  const endsAt = "2027-06-15T23:00:00.000Z";
  const tePayload = {
    name: "Lakers vs Celtics",
    occurs_at: startsAt,
    venue: { city: "Los Angeles", state_code: "CA", name: "Crypto Arena" },
    category: { short_name: "nba" },
  };

  const existing: ExistingEventRow[] = [
    {
      te_event_id: 2795400,
      title: tePayload.name,
      starts_at: startsAt,
      ends_at: endsAt,
      ended_at: null,
      polling_enabled: true,
      olt_url: "https://www.onlylocaltickets.com/events/lakers-vs-celtics-tickets/2795400",
    },
  ];

  const teClient = new MockTeEventsClient({ 2795400: tePayload });

  const outcome = await runRefreshMetadataCore({
    existingRows: existing,
    teClient,
    dryRun: true,
    now: new Date("2026-06-01T00:00:00.000Z"),
  });

  assertEquals(outcome.unchanged, 1);
  assertEquals(outcome.results[0].status, "unchanged");
});

Deno.test("metadata: olt_url generated when missing", async () => {
  const existing: ExistingEventRow[] = [
    {
      te_event_id: 2795400,
      title: "Test Event",
      starts_at: FUTURE_OCCURS_AT,
      ends_at: "2027-06-16T00:00:00.000Z",
      ended_at: null,
      polling_enabled: true,
      olt_url: null,
    },
  ];

  const teClient = new MockTeEventsClient({
    2795400: {
      name: "Test Event",
      occurs_at: FUTURE_OCCURS_AT,
      venue: { city: "Chicago", state_code: "IL", name: "United Center" },
      category: { short_name: "concerts" },
    },
  });

  const outcome = await runRefreshMetadataCore({
    existingRows: existing,
    teClient,
    dryRun: true,
    now: new Date("2026-06-01T00:00:00.000Z"),
  });

  assertEquals(outcome.updated, 1);
  assertEquals(outcome.results[0].changes?.includes("olt_url"), true);
});

Deno.test("metadata: ended event => polling_enabled false, ended_at set", async () => {
  const now = new Date("2027-06-20T00:00:00.000Z");
  const existing: ExistingEventRow[] = [
    {
      te_event_id: 2795400,
      title: "Past Event",
      starts_at: PAST_OCCURS_AT,
      ends_at: "2020-06-15T23:00:00.000Z",
      ended_at: null,
      polling_enabled: true,
      olt_url: null,
    },
  ];

  const teClient = new MockTeEventsClient({
    2795400: {
      name: "Past Event",
      occurs_at: PAST_OCCURS_AT,
      venue: { city: "NYC", state_code: "NY" },
    },
  });

  const outcome = await runRefreshMetadataCore({
    existingRows: existing,
    teClient,
    dryRun: true,
    now,
  });

  assertEquals(outcome.updated, 1);
  assertEquals(outcome.results[0].changes?.includes("polling_enabled"), true);
  assertEquals(outcome.results[0].changes?.includes("ended_at"), true);
});
