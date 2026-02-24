# TODO: Testing + Production Migration Plan

This checklist is for safely migrating TE polling from sandbox to production while hardening maintenance and retention behavior.

## 1) Pre-Production Hardening (Implementation)

- [x] **Add stop-check filtering in `hourly-poller` event selection**
  - Poll only events where `polling_enabled = true`
  - Exclude events with `ended_at IS NOT NULL`
  - Exclude events with `ends_at < now()` (or use a configurable grace/retention window)
  - Update `events_total` to reflect filtered events only

- [x] **Define and implement post-event retention policy**
  - Example policy:
    - While active event: keep hourly + daily
    - After event ended: keep daily long-term, prune hourly after N days
  - Make N configurable via env var: `HOURLY_RETENTION_DAYS_AFTER_END` (default: `7`)
  - Ensure retention job is idempotent

- [x] **Add metadata refresh workflow (bulk, not single-event only)**
  - `refresh-event-metadata` Edge Function (or script + scheduler)
  - Inputs: optional event IDs, `dry_run`
  - Updates: `title`, `starts_at`, `ends_at`, `ended_at`, `polling_enabled`, `olt_url`, `updated_at`
  - URL behavior:
    - `olt_url` auto-regenerates whenever `title` / `starts_at` / `ends_at` change or when `olt_url` is missing.
    - If required URL regeneration fails, mark the event as `status: "error"` and skip all updates for that event.

- [ ] **Bulk-populate `events` table for all World Cup games (performer_id source)**
  - Add/confirm ingestion path that fetches all events by TE `performer_id`
  - Upsert all expected World Cup games (target: 104 rows) with `te_event_id` uniqueness
  - Persist required fields for poller + embed: `title`, `starts_at`, `ends_at`, `polling_enabled`, `olt_url`
  - Add reconciliation check so reruns are safe and idempotent

- [ ] **Schedule jobs clearly**
  - Hourly poller: every hour
  - Daily rollup RPC: daily
  - Retention cleanup: daily (after rollup)
  - Metadata refresh: daily (or twice daily during tournament)

## 2) Test Plan: Hourly Poller

- [ ] **Test: skip disabled events**
  - Seed events with mixed `polling_enabled`
  - Assert only enabled events are processed
  - Assert `poller_runs.events_total` matches filtered count

- [ ] **Test: skip ended events**
  - Seed rows with `ended_at` set and/or `ends_at` in past
  - Assert no new hourly writes for ended events
  - Assert per-event logs show skipped/not processed behavior

- [ ] **Test: succeeded/failed/skipped accounting**
  - Mock TE responses:
    - valid listings => succeeded
    - no eligible listings => skipped
    - error/timeout => failed
  - Assert `poller_run_events` statuses and `poller_runs` aggregate counters

- [ ] **Test: stale lock recovery**
  - Seed stale `poller_runs` row (`finished_at = null`, old `started_at`)
  - Assert poller reclaims and proceeds
  - Seed fresh running row and assert `already_running`
  - Seed finished row and assert `already_ran`

- [ ] **Test: retry behavior**
  - TE mock returns 503/429 then success
  - Assert eventual success and no duplicate writes

## 3) Test Plan: Metadata Maintenance

- [ ] **Test: insert new event from TE**
  - Assert initial fields (`title`, `starts_at`, `ends_at`, `polling_enabled`)
  - Assert `olt_url` set when available/generatable

- [ ] **Test: update changed title/time**
  - Existing event, TE returns updated `name`/`occurs_at`
  - Assert metadata fields update correctly

- [ ] **Test: `olt_url` preservation/regeneration rules**
  - When TE data is unchanged, `olt_url` remains unchanged
  - When `title` / `starts_at` / `ends_at` change, `olt_url` is regenerated to match
  - When `olt_url` is missing, it is generated from TE metadata
  - When URL regeneration fails, event is returned with `status: "error"` and no fields are updated

- [ ] **Test: ended event toggle**
  - TE event in past => `polling_enabled=false`, `ended_at` set
  - Forced override path remains supported where required

- [ ] **Test: single-event dry_run using `event_id`**
  - Call `refresh-event-metadata` with `dry_run=true` and a single `event_id` (query or body)
  - Assert only that event is scanned and that `changes` reflect expected diffs

- [ ] **Test: performer_id bulk event ingestion (target 104)**
  - Run ingestion with known World Cup `performer_id`
  - Assert exactly 104 distinct `te_event_id` rows in `events`
  - Assert required fields are non-null/valid for polling (`title`, `starts_at`, `polling_enabled`)
  - Assert rerun is idempotent (no duplicate events; stable row count unless source changed)

## 4) Test Plan: Rollup + Retention

- [ ] **Test: rollup idempotency**
  - Run `rollup_hourly_to_daily()` twice
  - Assert same daily rows/values (no double-count)

- [ ] **Test: active event keeps hourly accumulating**
  - Simulate multiple hour buckets
  - Assert `event_price_hourly` grows for active event

- [ ] **Test: ended event daily-only retention**
  - Mark event ended, run cleanup
  - Assert old hourly rows pruned per policy
  - Assert `event_price_daily` remains intact

- [ ] **Test: no unbounded growth**
  - Seed large historical hourly set
  - Run retention
  - Assert hourly rows above retention horizon are removed

## 5) Test Plan: Embed Data Contracts

- [ ] **RPC contract tests for widget data dependencies**
  - `get_current_prices(p_te_event_id)`
  - `get_chart_data_hourly(p_te_event_id, p_hours_back)`
  - `get_chart_data_daily(p_te_event_id)`
  - Assert shape, null handling, ordering, and value semantics

- [ ] **Active vs ended event behavior**
  - Active: current + short-term chart present
  - Ended: historical (daily/all-time) still present after hourly retention

## 6) Suggested Test Scaffolding

- [ ] Add test directories:
  - `tests/integration/hourly-poller.test.ts`
  - `tests/integration/metadata-refresh.test.ts`
  - `tests/integration/retention-rollup.test.ts`
  - `tests/contracts/rpc-contract.test.ts`
  - `tests/fixtures/sql/*.sql`

- [ ] Add helpers:
  - Supabase test client helper
  - SQL fixture setup/teardown helper
  - TE mock server helper (deterministic API responses)

- [ ] Add CI/command entry points:
  - `npm run test:integration`
  - `npm run test:contracts`

## 7) Production Cutover Plan (Go/No-Go)

- [ ] **Environment variables set in production**
  - `TE_API_TOKEN` (prod)
  - `TE_API_SECRET` (prod)
  - `TE_API_BASE_URL=https://api.ticketevolution.com/v9`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Canary rollout**
  - Run production credentials on a small event subset first
  - Observe `poller_runs` + `poller_run_events` for 24h
  - Validate failures, retries, stale-lock behavior, and data freshness

- [ ] **Populate all World Cup events before full cutover**
  - Ingest by TE `performer_id` and verify expected event cardinality (104 games)
  - Reconcile `events` table against source list (`te_event_id` match, no duplicates)
  - Run metadata refresh in `dry_run` then apply mode to ensure `olt_url` + timing fields are in sync

- [ ] **Go criteria**
  - All poller, metadata, rollup/retention, and RPC contract tests passing
  - No unexplained `failed` spikes
  - Expected row growth and retention behavior confirmed

- [ ] **No-Go criteria**
  - Stop-check logic not enforced
  - Retention policy not implemented/verified
  - Metadata drift unresolved (title/time/url mismatch)
  - RPC output shape/regressions affecting embed

- [ ] **Post-cutover monitoring**
  - Daily review of run status distribution
  - Alert on repeated run failures or stale lock recoveries
  - Spot-check widget data for active and ended events
