# Maintenance Guide – Configuration & Operations

This document is for **ongoing maintenance** of the Historical Ticket Data system: how to adjust behavior (retention, polling, metadata, API targets) without touching code.

Over time, you can replace some of these env‑var–based settings with a non‑engineer friendly **config table** in Postgres. Until then, this file is the source of truth for how to change things.

---

## 1. Where configuration lives today

There are two main places configuration lives:

- **Supabase Edge Function secrets / environment variables**
  - Used by: `hourly-poller` and other Edge Functions.
  - Set per environment (dev / staging / production) in the Supabase dashboard or via Supabase CLI.

- **Scripts `.env` file**
  - Used by: local Node scripts (e.g. `scripts/upsertEvent.js`).
  - Not deployed to production; only for local tooling.

Longer‑term, some of these knobs should move into a **`settings` config table** so non‑engineers can edit values via Supabase UI or a small admin panel. See [§6 Future: Config Table](#6-future-config-table) for a sketch.

---

## 2. Current environment variables and their effects

### 2.1 Ticket Evolution (TE) API

**Scope:** All code calling the TE API (Edge Functions + local scripts)

- `TE_API_TOKEN`
- `TE_API_SECRET`
- `TE_API_BASE_URL`
  - **Sandbox:** `https://api.sandbox.ticketevolution.com/v9`
  - **Production:** `https://api.ticketevolution.com/v9`

**How to change (Supabase Edge Functions):**

1. Go to **Supabase dashboard → Project → Edge Functions → Configuration / Secrets**.
2. Update:
   - `TE_API_TOKEN`
   - `TE_API_SECRET`
   - `TE_API_BASE_URL`
3. **Redeploy** the affected Edge Functions (e.g. `hourly-poller`).

**How to change locally (scripts):**

1. Edit `.env` in repo root:
   ```bash
   TE_API_TOKEN=...
   TE_API_SECRET=...
   TE_API_BASE_URL=https://api.sandbox.ticketevolution.com
   ```
2. Re‑run scripts like:
   ```bash
   node scripts/upsertEvent.js <te_event_id>
   ```

**When to touch this:**

- Migrating from sandbox → production.
- Rotating TE credentials.

---

### 2.2 Hourly retention window after event end

**Scope:** `hourly-poller` Edge Function (retention cleanup step)

Env var:

- `HOURLY_RETENTION_DAYS_AFTER_END`
  - **Default:** `7` (if unset or invalid)
  - **Meaning:** For **ended events**, keep hourly rows in `event_price_hourly` only for the last **N days**. Older hourly rows are pruned; daily rows in `event_price_daily` are kept long‑term.

**Where it’s used:**

- In `supabase/functions/hourly-poller/index.ts`:
  - `getHourlyRetentionDaysAfterEnd()` reads the env var.
  - `applyEndedEventHourlyRetention(...)`:
    - Finds ended events (`ended_at` set OR `ends_at < now()`).
    - Deletes `event_price_hourly` rows older than the cutoff.
    - Is **idempotent**: running again with the same cutoff won’t delete additional rows.

**How to change (Supabase):**

1. In Supabase dashboard, under Edge Function secrets:
   - Add or update `HOURLY_RETENTION_DAYS_AFTER_END`.
   - Examples:
     - `7` (keep one week of hourly after end)
     - `30` (keep one month of hourly after end)
2. Redeploy `hourly-poller`.
3. Verify via:
   - Recent `poller_runs.debug.retention` JSON (contains `retention_days`, `cutoff_iso`, `deleted_hourly_rows`).

**Guidance:**

- **Smaller N** = less storage, but less hourly detail after events end.
- **Larger N** = more detailed post‑event analysis, but more storage.

---

### 2.3 Supabase credentials for Edge Functions

**Scope:** All Supabase Edge Functions.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**How to change:**

- Normally these rarely change. If rotated:
  1. Update in Supabase function secrets.
  2. Redeploy Edge Functions.

---

## 3. Operational knobs (behavioral changes)

These are changes that **non‑engineers may want**, but today still require an engineer to touch env vars or run scripts.

### 3.1 Changing how long to keep hourly data

See [§2.2 Hourly retention window after event end](#22-hourly-retention-window-after-event-end).

**Quick recipe:**

- “Keep 30 days of hourly after events end”:
  1. Set `HOURLY_RETENTION_DAYS_AFTER_END=30` in Supabase secrets.
  2. Redeploy `hourly-poller`.
  3. After a few runs, check logs / `poller_runs.debug.retention` for deletions around the new cutoff.

### 3.2 Enabling / disabling polling for specific events

**Scope:** `events.polling_enabled`, `events.ends_at`, `events.ended_at`

**How to adjust:**

- Use `scripts/upsertEvent.js` locally to:
  - Create/update events.
  - Control `polling_enabled`, `ends_at`, `ended_at`.
- Or, edit events directly in Supabase table editor (carefully).

**Stop-check logic in poller:**

- An event is **skipped** by `hourly-poller` if:
  - `polling_enabled = false`, or
  - `ended_at IS NOT NULL`, or
  - `ends_at` exists and `ends_at < now()`

Operationally:

- To **stop polling now**, set `polling_enabled=false` or set `ended_at` to current time.
- To **extend polling** (e.g. retention window around event time), adjust `ends_at` accordingly and ensure `polling_enabled=true`.

---

### 3.3 Metadata refresh (event titles, times, URLs)

**Function:** `refresh-event-metadata` (Supabase Edge Function)

**Request body:**

```json
{
  "dry_run": true,
  "te_event_ids": [2795538, 2795400]
}
```

**Supported inputs:**

- `dry_run` (default `true`)
  - `true`: compute and report changes only (no DB writes)
  - `false`: apply updates to `events`
- `event_id` (optional, single-event test mode; request body)
- `te_event_ids` (optional, array for subset refresh)
- Query param alternative:
  - `?event_id=2795538` (single-event test mode)

**ID precedence:**

1. `event_id` query param (if valid)
2. `event_id` in request body (if valid)
3. `te_event_ids` array (if provided)
4. otherwise: all events

**What gets refreshed:**

- `title`
- `starts_at`
- `ends_at` (derived as start + configured duration in function logic)
- `polling_enabled` (auto-false if event has ended; otherwise preserves current manual flag)
- `ended_at` (set once when event first transitions to ended; never cleared)
- `olt_url`
- `updated_at`

**`olt_url` behavior (important):**

- `olt_url` is treated as **derived metadata** and auto-regenerates when:
  - `title` changed, or
  - `starts_at` changed, or
  - `ends_at` changed, or
  - existing `olt_url` is missing
- If none of the above changed and URL exists, current `olt_url` is preserved.

**Failure policy (fail-closed):**

- If URL regeneration is required and `buildOltEventUrl(...)` fails:
  - That event is returned as `status: "error"`
  - **No updates are applied** for that event
  - Other events continue processing

**Recommended operating flow:**

1. Run dry-run first:
   ```json
   { "dry_run": true }
   ```
2. Inspect response (`updated`, `unchanged`, `errors`, and per-event `changes`).
3. Apply:
   ```json
   { "dry_run": false }
   ```

---

### 3.4 Switching TE sandbox ↔ production

For **Edge Functions**:

1. In Supabase secrets:
   - `TE_API_BASE_URL=https://api.ticketevolution.com/v9`
   - Set production `TE_API_TOKEN` and `TE_API_SECRET`.
2. Redeploy `hourly-poller` and any other TE‑calling functions.
3. Monitor:
   - `poller_runs.status`, `events_failed`, `error_sample`.

For **local scripts**:

1. Update `.env`:
   ```bash
   TE_API_BASE_URL=https://api.ticketevolution.com
   TE_API_TOKEN=...
   TE_API_SECRET=...
   ```
2. Re‑run scripts like `upsertEvent.js` using the correct environment.

---

## 4. How to make a safe config change (checklist)

Use this when changing **any** of the above env‑level knobs:

1. **Decide the change**
   - What exactly are you changing? (e.g. “retention from 7 → 14 days”)
   - Which environments? (dev/stage/prod)

2. **Update in the least critical environment first**
   - Apply to **dev** or **staging** Supabase secrets.
   - Redeploy the function.
   - Run a manual invocation (if possible) and inspect:
     - Logs
     - `poller_runs` rows (`debug` payload)

3. **Observe effects**
   - For retention: look at `deleted_hourly_rows` and sample data.
   - For API base URL / TE creds: watch for new errors hitting TE.

4. **Roll out to production**
   - Repeat the env var update in production.
   - Redeploy.
   - Monitor for at least one full polling cycle.

5. **Rollback plan**
   - Always know the previous value (log it here in MAINTENANCE.md or a changelog).
   - If something looks wrong, revert the value and redeploy.

---

## 5. Quick reference: current defaults / assumptions

> Update this section whenever you intentionally change a default.

- `TE_API_BASE_URL`:
  - **Dev/sandbox:** `https://api.sandbox.ticketevolution.com/v9`
  - **Prod target:** `https://api.ticketevolution.com/v9`
- `HOURLY_RETENTION_DAYS_AFTER_END`:
  - Default: `7`
  - Meaning: For ended events, keep hourly data for 7 days after end, then prune.

---

## 6. Future: Config Table

Longer‑term, to make this non‑engineer friendly, introduce a **`settings`** table, e.g.:

```sql
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

Example rows:

```sql
insert into settings (key, value) values
  ('hourly_retention_after_end_days', jsonb_build_object('days', 7)),
  ('te_api_base_url', jsonb_build_object('url', 'https://api.sandbox.ticketevolution.com/v9'));
```

Then:

- Edge Functions read from `settings` first, fall back to env defaults if missing.
- Non‑engineers can:
  - Edit `settings` via Supabase UI.
  - Use a small internal admin tool that updates rows with validation.

**When to do this:**

- When configuration changes become frequent.
- When you want non‑developers (ops, product, account managers) to tune behavior without deploys.

Until then, this `MAINTENANCE.md` is the companion guide for making safe env‑based adjustments.
