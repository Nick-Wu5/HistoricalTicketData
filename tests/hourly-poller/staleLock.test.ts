import { acquireLockOrSkip } from "../../supabase/functions/hourly-poller/lock.ts";
import { createMockLockAdapter } from "../helpers/mockLockAdapter.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

Deno.test("stale lock recovery: reclaims and proceeds", async () => {
  const now = new Date("2026-06-12T02:00:00.000Z");
  const hourBucket = "2026-06-12T02:00:00.000Z";
  const staleStartedAt = "2026-06-12T01:00:00.000Z";

  const adapter = createMockLockAdapter({
    insertConflict: true,
    existingRow: { started_at: staleStartedAt, finished_at: null },
  });

  const result = await acquireLockOrSkip(adapter, hourBucket, {
    now,
    staleMinutes: 15,
  });

  assertEquals(result.acquired, true);
});

Deno.test("already_running: fresh running row", async () => {
  const now = new Date("2026-06-12T02:00:00.000Z");
  const hourBucket = "2026-06-12T02:00:00.000Z";
  const recentStartedAt = "2026-06-12T01:55:00.000Z";

  const adapter = createMockLockAdapter({
    insertConflict: true,
    existingRow: { started_at: recentStartedAt, finished_at: null },
  });

  const result = await acquireLockOrSkip(adapter, hourBucket, {
    now,
    staleMinutes: 15,
  });

  assertEquals(result.acquired, false);
  if (result.acquired) throw new Error("unreachable");
  assertEquals(result.reason, "already_running");
  assertEquals(result.hour_bucket, hourBucket);
});

Deno.test("already_ran: finished row", async () => {
  const now = new Date("2026-06-12T02:00:00.000Z");
  const hourBucket = "2026-06-12T02:00:00.000Z";
  const finishedAt = "2026-06-12T01:30:00.000Z";

  const adapter = createMockLockAdapter({
    insertConflict: true,
    existingRow: {
      started_at: "2026-06-12T01:00:00.000Z",
      finished_at: finishedAt,
    },
  });

  const result = await acquireLockOrSkip(adapter, hourBucket, { now });

  assertEquals(result.acquired, false);
  if (result.acquired) throw new Error("unreachable");
  assertEquals(result.reason, "already_ran");
  assertEquals(result.hour_bucket, hourBucket);
});

Deno.test("acquired: fresh insert succeeds", async () => {
  const hourBucket = "2026-06-12T02:00:00.000Z";

  const adapter = createMockLockAdapter({
    insertConflict: false,
    existingRow: null,
  });

  const result = await acquireLockOrSkip(adapter, hourBucket);

  assertEquals(result.acquired, true);
});
