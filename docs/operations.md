# Operations & Diagnostics

This document covers day-to-day operation of the Historical Ticket Data system: configuration knobs, troubleshooting the poller, and moving between sandbox and production.

---

## 1. Configuration

### Where configuration lives

- **Supabase Edge Function secrets** — Used by `hourly-poller` and other Edge Functions. Set per environment in the Supabase dashboard or via CLI.
- **Scripts `.env` file** — Used by local Node scripts (e.g. `scripts/upsertEvent.js`). Not deployed to production.

Longer-term, some of these knobs should move into a `settings` config table so non-engineers can edit values without deploys. See [Future: Config Table](#future-config-table).

### Ticket Evolution API

| Variable | Purpose |
| --- | --- |
| `TE_API_TOKEN` | TE API token |
| `TE_API_SECRET` | TE API secret |
| `TE_API_BASE_URL` | Sandbox: `https://api.sandbox.ticketevolution.com/v9`, Production: `https://api.ticketevolution.com/v9` |

**Edge Functions:** Update secrets in Supabase dashboard → Edge Functions → Configuration / Secrets, then redeploy.

**Local scripts:** Update `.env` in repo root, then re-run scripts.

### Supabase credentials

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (write access) |

These rarely change. If rotated, update in function secrets and redeploy.

### Hourly retention (ended events)

The SQL function `public.apply_ended_event_hourly_retention(p_retention_days)` deletes old hourly rows for ended events. Default: 7 days.

- Finds ended events (`ended_at` set OR `ends_at < now()`).
- Deletes `event_price_hourly` rows older than the cutoff.
- Idempotent — re-running with the same cutoff is safe.

**To change:** Update the argument in the cron command:

```sql
select public.apply_ended_event_hourly_retention(14); -- keep 14 days instead of 7
```

Guidance: smaller N = less storage; larger N = more post-event detail.

---

## 2. Operational Procedures

### Enabling / disabling polling for specific events

An event is skipped by the poller if:
- `polling_enabled = false`, or
- `ended_at IS NOT NULL`, or
- `ends_at` exists and `ends_at < now()`

To stop polling: set `polling_enabled = false` or set `ended_at` to current time.
To extend polling: adjust `ends_at` and ensure `polling_enabled = true`.

### Metadata refresh

The `refresh-event-metadata` Edge Function updates event titles, times, URLs, and polling status from the TE API.

**Request body:**

```json
{
  "dry_run": true,
  "te_event_ids": [2795538, 2795400]
}
```

- `dry_run` (default `true`): report changes without writing.
- `te_event_ids` (optional): refresh a subset. Omit to refresh all events.
- `event_id` (optional, query param or body): single-event test mode.

**ID precedence:** `event_id` query param > `event_id` body > `te_event_ids` array > all events.

**What gets refreshed:** `title`, `starts_at`, `ends_at`, `polling_enabled` (auto-false if ended), `ended_at` (set once on transition), `olt_url` (regenerated when title/dates change), `updated_at`.

**Recommended flow:** Run dry-run first, inspect results, then apply with `"dry_run": false`.

**Failure policy:** If URL regeneration fails for an event, that event is returned as `status: "error"` with no updates applied. Other events continue processing.

### Daily maintenance sequence

Two cron jobs run in order:

1. `daily_rollup` at `10 1 * * *` — `select public.rollup_hourly_to_daily();`
2. `daily_retention` at `15 1 * * *` — `select public.apply_ended_event_hourly_retention(7);`

Keep retention at least 5 minutes after rollup. Verify with:

```sql
select jobname, schedule, command, active
from cron.job
where jobname in ('daily_rollup', 'daily_retention')
order by schedule;
```

### Switching sandbox to production

**Edge Functions:**

1. Set `TE_API_BASE_URL=https://api.ticketevolution.com/v9` in Supabase secrets.
2. Set production `TE_API_TOKEN` and `TE_API_SECRET`.
3. Redeploy `hourly-poller` and any other TE-calling functions.
4. Monitor `poller_runs.status`, `events_failed`, `error_sample`.

**Local scripts:**

1. Update `.env` with production credentials and base URL.
2. Re-run scripts.

---

## 3. Safe Config Change Checklist

1. **Decide the change** — What exactly? Which environments?
2. **Apply to dev/staging first** — Update secrets, redeploy, run a manual invocation, inspect logs.
3. **Observe effects** — Check `poller_runs` rows, retention counts, or TE response status.
4. **Roll out to production** — Repeat, then monitor for at least one full polling cycle.
5. **Rollback plan** — Log the previous value. If something breaks, revert and redeploy.

---

## 4. Poller Diagnostics

### Diagnostic logging

The poller logs:
- Hour bucket being processed (UTC).
- Data hash for each event (detects if API returned different listings).
- Comparison with previous hour (shows if prices changed).
- Warnings when data is identical to previous hour.

### Skip diagnostics

When an event has no eligible listings after filtering, it is recorded as `skipped` with counters explaining where listings were filtered out:

| Counter | Meaning |
| --- | --- |
| `raw_listing_count` | Total listings from TE API (before filtering) |
| `event_listing_count` | After filtering to `type=event` with valid prices |
| `quantity_match_count` | After requiring `available_quantity >= 1` |
| `buyable_listing_count` | After excluding non-buyable notes |
| `skip_reason` | `no_te_listings`, `no_event_listings`, `no_valid_quantity`, or `no_buyable_listings` |

A skipped event still gets an `event_price_hourly` row with `listing_count = 0` and null prices (explicit gap, not a missing row).

**Query skipped events:**

```sql
select hour_bucket, te_event_id, status, skip_reason,
       raw_listing_count, event_listing_count,
       quantity_match_count, buyable_listing_count
from poller_run_events
where status = 'skipped'
order by hour_bucket desc
limit 200;
```

### Verifying the poller is working

**Check hour buckets are unique:**

```sql
select captured_at_hour, count(*) as event_count,
       min(min_price) as min_min_price, max(max_price) as max_max_price
from event_price_hourly
group by captured_at_hour
order by captured_at_hour desc
limit 10;
```

**Check poller run status:**

```sql
select hour_bucket, status, events_total, events_succeeded, events_failed,
       started_at, finished_at
from poller_runs
order by hour_bucket desc
limit 10;
```

### What to look for

| Signal | Meaning |
| --- | --- |
| Different `hour_bucket` values each hour | Healthy |
| Data hash changes between hours | Real data is flowing |
| Same prices for multiple hours | Normal in sandbox (static data) |
| Same `hour_bucket` reused | Bug — investigate |
| All events failing | Check credentials, API status |

### Sandbox vs production behavior

Sandbox data is updated nightly with sparse, random inventory. Seeing identical aggregates for multiple hours is normal in sandbox. In production, prices change as real inventory updates.

---

## 5. Quick Reference: Current Defaults

> Update this section when defaults change.

- `TE_API_BASE_URL`: Dev/sandbox `https://api.sandbox.ticketevolution.com/v9`, Prod `https://api.ticketevolution.com/v9`
- `apply_ended_event_hourly_retention(<days>)`: Default `7`

---

## Future: Config Table

To make configuration non-engineer friendly, introduce a `settings` table:

```sql
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

Edge Functions would read from `settings` first, falling back to env defaults. Non-engineers could then edit config via Supabase UI or a small admin panel.

**When to do this:** When configuration changes become frequent or non-developers need to tune behavior without deploys.
