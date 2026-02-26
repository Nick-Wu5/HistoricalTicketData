# Database Schema & RPC Functions Guide

This document provides a detailed, non-technical explanation of how our Supabase database is structured and how the specialized "RPC functions" work to power the ticket pricing chart.

## 1. The Tables (How Data is Organized)

We use **five main tables** to store information. Think of these like interconnected spreadsheets.

### Table: `events`

This is our "Master List" of events (one row per game/show).

- **`te_event_id`**: The primary key in our system and the ID from the Ticket Evolution API (our data source).
- **`title`**: The name of the event (e.g., "Lakers vs Celtics").
- **`olt_url`**: The link to the event page on OnlyLocalTickets.
- **`polling_enabled`**: Whether the hourly poller should actively collect prices for this event.
- **`starts_at`, `ends_at`, `ended_at`**: When the event is scheduled and when it actually completed.
- **`created_at`, `updated_at`**: When we first created / last updated this event record.

### Table: `event_price_hourly`

This stores the "raw time-series data" we collect every hour (one row per event per hour).

- **`te_event_id`**: Points back to the event in the master list (`events.te_event_id`).
- **`captured_at_hour`**: The UTC hour bucket when the prices were recorded (e.g. `2026-06-15T14:00:00Z`).
- **`min_price`, `avg_price`, `max_price`**: The price values we calculated for that hour.
- **`listing_count`**: How many ticket listings were available.
- **`created_at`**: When this hourly snapshot was written.

### Table: `event_price_daily`

This is a "summary table" used for the long-term (All-Time) view.

- One row per event per **day**, rolled up from the hourly data.
- **`te_event_id`**: Points back to the event in the master list.
- **`date`**: The calendar date of the summary (e.g. `2026-06-15`).
- **`min_price`, `avg_price`, `max_price`**: Daily aggregated prices.
- **`samples`**: How many hourly snapshots contributed to that day's summary.
- This keeps the database fast and efficient for long-range charts.

### Table: `poller_runs`

This tracks each execution of the hourly polling job.

- **`hour_bucket`**: The UTC hour this run is responsible for (acts like a run ID).
- **`status`**: Overall status of the run (e.g. `started`, `succeeded`, `failed`).
- **`batch_size`**: How many events are processed concurrently in each batch.
- **`events_total`, `events_processed`, `events_succeeded`, `events_failed`**: High-level counters for observability.
- **`started_at`, `finished_at`**: When the run began and when it ended.
- **`error_sample`** and **`debug`**: Optional fields used to store example errors or debug metadata when things go wrong.

### Table: `poller_run_events`

This records the per-event outcome for a given poller run (one row per event per hour).

- **`hour_bucket`**: Links back to the parent run in `poller_runs`.
- **`te_event_id`**: Which event this row is about.
- **`status`**: Whether this event's polling succeeded, failed, or was skipped (e.g. `succeeded`, `failed`, `skipped`).
- **`listing_count`**: How many listings were used to compute the prices.
- **`min_price`, `avg_price`, `max_price`**: The prices we calculated for this event in this hour.
- **`error`**: A short error code or message explaining what went wrong when `status = failed` or `skipped`.
- **`created_at`**: When this per-event record was written.

---

## 2. Relationships (How Tables Talk to Each Other)

We use **Foreign Keys** to link tables.

- The `event_price_hourly` and `event_price_daily` tables both have a `te_event_id` column.
  - This "points" to a specific row in the `events` table.
  - **Why?** This way, we don't have to repeat the event title ("Lakers vs Celtics") thousands of times. We just store it once and reference it.
- The `poller_run_events` table has an `hour_bucket` column.
  - This links each per-event result back to the parent row in `poller_runs`.
  - Together, `hour_bucket + te_event_id` uniquely identify the result for a given event in a given hourly run.

---

## 3. What are RPC Functions?

**RPC** stands for **Remote Procedure Call**.

In simple terms: It’s a custom script that runs _inside_ the database instead of in your application code.

### Why use them?

1. **Speed**: It's much faster to ask the database to "calculate the 3-day view and give me the result" than to fetch thousands of individual rows and calculate it in the browser.
2. **Simplicity**: Your frontend code (React) just makes one simple call: `get_chart_data_hourly(event_id)`. The database does the heavy lifting of filtering and sorting.

### Our RPC Functions:

#### `get_chart_data_hourly(p_te_event_id, p_hours_back)`

- **What it does**: Fetches the hourly prices for a specific event, going back a certain number of hours (used for the "3-day" style view).
- **Inputs**: The Ticket Evolution event ID and how many hours back to look.
- **Output**: A clean list of `recorded_at` timestamps and min/avg/max prices, ready to be drawn on the chart.

#### `get_chart_data_daily(p_te_event_id)`

- **What it does**: Fetches every daily summary record for an event from `event_price_daily`.
- **Inputs**: The Ticket Evolution event ID.
- **Output**: The `recorded_date` plus min/avg/max prices needed for the "All-Time" view of the chart.

#### `get_current_prices(p_te_event_id)`

- **What it does**: Returns the latest snapshot of prices for a given event, plus how much they changed in the last 24 hours.
- **Inputs**: The Ticket Evolution event ID.
- **Output**: A single row with `min_price`, `avg_price`, `max_price`, `listing_count`, `last_updated`, and `change_24h` (percentage change).

#### `get_24h_change(p_te_event_id)`

- **What it does**: Calculates just the 24‑hour price change for an event.
- **Inputs**: The Ticket Evolution event ID.
- **Output**: A single number representing the percent change over the last 24 hours.

#### `rollup_hourly_to_daily()`

- **What it does**: Periodically aggregates the detailed hourly data into the `event_price_daily` table.
- **Why**: This keeps long‑term charts snappy by summarizing older data into one row per day instead of thousands of hourly rows.

#### `apply_ended_event_hourly_retention(p_retention_days integer default 7)`

- **What it does**: Deletes old hourly rows from `event_price_hourly` for ended events only.
- **Why**: Keeps storage bounded while preserving long-term history in `event_price_daily`.
- **Run order**: Scheduled after `rollup_hourly_to_daily()` so cleanup never precedes daily aggregation.

---

## 4. Security (RLS)

**RLS (Row Level Security)** is like a bouncer for our data.

- **Public View**: Anyone can _read_ the prices (so the chart works for everyone).
- **Private Edit**: Only our "Secret Key" (used by the ingestion service) is allowed to _add_ or _change_ price data. This prevents anyone from tampering with the historical records.
