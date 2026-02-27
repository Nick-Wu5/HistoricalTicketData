/**
 * Poller lock acquisition and stale-lock recovery.
 * Extractable for unit testing.
 */

export type LockResult =
  | { acquired: true }
  | { acquired: false; reason: "already_ran"; hour_bucket: string }
  | { acquired: false; reason: "already_running"; hour_bucket: string };

export type PollerLockAdapter = {
  insert(row: Record<string, unknown>): Promise<{
    error?: { code?: string; message?: string } | null;
  }>;
  selectExisting(hourBucket: string): Promise<{
    data: { started_at: string; finished_at: string | null } | null;
    error?: unknown;
  }>;
  tryStaleRecovery(
    hourBucket: string,
    staleCutoffIso: string,
    payload: Record<string, unknown>,
  ): Promise<{
    data: Array<{ hour_bucket: string }> | null;
    error?: unknown;
  }>;
};

const STALE_MINUTES = 15;

export async function acquireLockOrSkip(
  adapter: PollerLockAdapter,
  hourBucket: string,
  opts?: { staleMinutes?: number; now?: Date; batchSize?: number },
): Promise<LockResult> {
  const staleMinutes = opts?.staleMinutes ?? STALE_MINUTES;
  const now = opts?.now ?? new Date();
  const batchSize = opts?.batchSize ?? 10;

  const insertRow = {
    hour_bucket: hourBucket,
    status: "started",
    batch_size: batchSize,
    events_processed: 0,
  };

  const { error: lockAcquireError } = await adapter.insert(insertRow);

  if (!lockAcquireError) {
    return { acquired: true };
  }

  const isConflict = lockAcquireError.code === "23505";
  if (!isConflict) {
    throw new Error(`Failed to acquire lock: ${lockAcquireError.message}`);
  }

  const { data: existingRun, error: readExistingErr } =
    await adapter.selectExisting(hourBucket);

  if (readExistingErr) {
    throw new Error(
      `Failed to read existing run row: ${String(readExistingErr)}`,
    );
  }
  if (!existingRun) {
    throw new Error(
      `Lock conflict but run row missing for hour bucket ${hourBucket}`,
    );
  }

  if (existingRun.finished_at) {
    return { acquired: false, reason: "already_ran", hour_bucket: hourBucket };
  }

  const staleCutoffIso = new Date(
    now.getTime() - staleMinutes * 60 * 1000,
  ).toISOString();
  const nowIso = now.toISOString();

  const updatePayload = {
    status: "failed",
    error_sample: "stale_lock_timeout",
    started_at: nowIso,
    batch_size: batchSize,
    events_processed: 0,
  };

  const { data: recoveredRows, error: recoverErr } =
    await adapter.tryStaleRecovery(hourBucket, staleCutoffIso, updatePayload);

  if (recoverErr) {
    throw new Error(`Failed stale-lock recovery: ${String(recoverErr)}`);
  }

  const rows = Array.isArray(recoveredRows)
    ? recoveredRows
    : recoveredRows != null
      ? [recoveredRows]
      : [];
  const didRecover =
    rows.length > 0 && (rows[0] as { hour_bucket?: string })?.hour_bucket === hourBucket;

  if (!didRecover) {
    return {
      acquired: false,
      reason: "already_running",
      hour_bucket: hourBucket,
    };
  }

  return { acquired: true };
}

type SupabaseClientLike = { from: (table: string) => unknown };

export function createSupabaseLockAdapter(
  supabase: SupabaseClientLike,
): PollerLockAdapter {
  const table = () =>
    supabase.from("poller_runs") as {
      insert: (row: Record<string, unknown>) => Promise<{ error?: unknown }>;
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: { started_at: string; finished_at: string | null } | null;
            error?: unknown;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => {
          is: (col: string, val: unknown) => {
            lt: (col: string, val: string) => {
              select: (cols: string) => Promise<{
                data: Array<{ hour_bucket: string }> | null;
                error?: unknown;
              }>;
            };
          };
        };
      };
    };

  return {
    async insert(row) {
      const { error } = await table().insert(row);
      return { error: error as { code?: string; message?: string } | null };
    },
    async selectExisting(hourBucket) {
      const { data, error } = await table()
        .select("hour_bucket, started_at, finished_at")
        .eq("hour_bucket", hourBucket)
        .maybeSingle();
      return { data, error };
    },
    async tryStaleRecovery(hourBucket, staleCutoffIso, payload) {
      const { data, error } = await table()
        .update(payload)
        .eq("hour_bucket", hourBucket)
        .is("finished_at", null)
        .lt("started_at", staleCutoffIso)
        .select("hour_bucket");
      return { data, error };
    },
  };
}
