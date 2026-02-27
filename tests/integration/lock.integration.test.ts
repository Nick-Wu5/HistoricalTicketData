/**
 * Integration test for poller lock acquisition against a real Supabase instance.
 *
 * Requires SUPABASE_URL and an API key. Accepts any of:
 *   - SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (secret; full access)
 *   - SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY (publishable; RLS applies)
 *
 * The "stale recovery" test needs INSERT/UPDATE on poller_runs. With anon key,
 * RLS must allow those operations or the test will fail.
 *
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-env --allow-net tests/integration/lock.integration.test.ts
 *
 * Skipped when SUPABASE_URL or no key is set.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../supabase/database.types.ts";
import {
  acquireLockOrSkip,
  createSupabaseLockAdapter,
} from "../../supabase/functions/hourly-poller/lock.ts";

const TEST_HOUR_BUCKET = "2030-06-15T12:00:00.000Z";

function getSupabaseCredentials(): { url: string; key: string } | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;
  return { url, key };
}

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

async function cleanup(
  supabase: ReturnType<typeof createClient<Database>>,
  hourBucket: string,
) {
  await supabase.from("poller_runs").delete().eq("hour_bucket", hourBucket);
}

Deno.test({
  name: "integration: lock - fresh insert acquires",
  ignore: !getSupabaseCredentials(),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const creds = getSupabaseCredentials()!;
    const supabase = createClient<Database>(creds.url, creds.key);
    const adapter = createSupabaseLockAdapter(supabase);

    await cleanup(supabase, TEST_HOUR_BUCKET);

    const result = await acquireLockOrSkip(adapter, TEST_HOUR_BUCKET);

    assertEquals(result.acquired, true);

    await cleanup(supabase, TEST_HOUR_BUCKET);
  },
});

Deno.test({
  name: "integration: lock - already_ran when finished",
  ignore: !getSupabaseCredentials(),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const creds = getSupabaseCredentials()!;
    const supabase = createClient<Database>(creds.url, creds.key);
    const adapter = createSupabaseLockAdapter(supabase);

    await cleanup(supabase, TEST_HOUR_BUCKET);

    await supabase.from("poller_runs").insert({
      hour_bucket: TEST_HOUR_BUCKET,
      status: "succeeded",
      batch_size: 10,
      events_processed: 1,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });

    const result = await acquireLockOrSkip(adapter, TEST_HOUR_BUCKET);

    assertEquals(result.acquired, false);
    if (result.acquired) throw new Error("unreachable");
    assertEquals(result.reason, "already_ran");

    await cleanup(supabase, TEST_HOUR_BUCKET);
  },
});

Deno.test({
  name: "integration: lock - stale recovery reclaims",
  ignore: !getSupabaseCredentials(),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const creds = getSupabaseCredentials()!;
    const supabase = createClient<Database>(creds.url, creds.key);
    const adapter = createSupabaseLockAdapter(supabase);

    await cleanup(supabase, TEST_HOUR_BUCKET);

    const now = new Date();
    const staleStartedAt = new Date(
      now.getTime() - 60 * 60 * 1000,
    ).toISOString();

    const { error: insertErr } = await supabase.from("poller_runs").insert({
      hour_bucket: TEST_HOUR_BUCKET,
      status: "started",
      batch_size: 10,
      events_processed: 0,
      finished_at: null,
    });
    if (insertErr) throw new Error(`Seed insert failed: ${insertErr.message}`);

    const { error: updateErr } = await supabase
      .from("poller_runs")
      .update({ started_at: staleStartedAt })
      .eq("hour_bucket", TEST_HOUR_BUCKET);
    if (updateErr) throw new Error(`Seed update failed: ${updateErr.message}`);

    const staleCutoffIso = new Date(
      now.getTime() - 15 * 60 * 1000,
    ).toISOString();
    const { data: preCheck } = await supabase
      .from("poller_runs")
      .select("started_at, finished_at")
      .eq("hour_bucket", TEST_HOUR_BUCKET)
      .single();
    if (
      !preCheck ||
      preCheck.finished_at !== null ||
      (preCheck.started_at && preCheck.started_at >= staleCutoffIso)
    ) {
      throw new Error(
        `Pre-check failed: row should have finished_at=null and started_at < cutoff. Got: ${JSON.stringify(preCheck)}, cutoff=${staleCutoffIso}`,
      );
    }

    const result = await acquireLockOrSkip(adapter, TEST_HOUR_BUCKET, {
      now,
      staleMinutes: 15,
    });

    assertEquals(result.acquired, true);

    const { data: row } = await supabase
      .from("poller_runs")
      .select("status, error_sample")
      .eq("hour_bucket", TEST_HOUR_BUCKET)
      .single();
    assertEquals(row?.status, "failed");
    assertEquals(row?.error_sample, "stale_lock_timeout");

    await cleanup(supabase, TEST_HOUR_BUCKET);
  },
});
