import type { PollerLockAdapter } from "../../supabase/functions/hourly-poller/lock.ts";

export type MockLockConfig = {
  /** If true, insert returns conflict (23505) */
  insertConflict: boolean;
  /** When conflict: existing row (used for select and for stale recovery check) */
  existingRow: { started_at: string; finished_at: string | null } | null;
};

/**
 * Mock lock adapter for testing acquireLockOrSkip.
 * When insertConflict is true, selectExisting returns existingRow.
 * tryStaleRecovery returns 1 row iff existingRow.finished_at is null
 * and existingRow.started_at < staleCutoffIso.
 */
export function createMockLockAdapter(
  config: MockLockConfig,
): PollerLockAdapter {
  return {
    async insert() {
      if (config.insertConflict) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      return { error: null };
    },
    async selectExisting() {
      return { data: config.existingRow, error: null };
    },
    async tryStaleRecovery(_hourBucket, staleCutoffIso) {
      const row = config.existingRow;
      const matches =
        row &&
        row.finished_at === null &&
        row.started_at < staleCutoffIso;
      return {
        data: matches ? [{ hour_bucket: _hourBucket }] : [],
        error: null,
      };
    },
  };
}
