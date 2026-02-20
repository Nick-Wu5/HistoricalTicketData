# TODO

- [ ] **Add stop-check for ended events**
  - In the hourly poller, skip polling for events whose `ends_at`/`ended_at` is in the past (and/or set `polling_enabled = false` for completed events).
  - Ensure `events_total` / `events_processed` still reflect only actively polled events.

- [ ] **Metadata refresh function for events**
  - Add a Supabase Edge Function or RPC that refreshes event metadata from Ticket Evolution (e.g. updated `title`, times, URL) for all known `te_event_id`s.
  - Use `scripts/olt-url-utils.js` → `buildOltEventUrl(event)` to regenerate `olt_url` when title/venue/occurs_at change (keeps URLs valid).
  - Decide how/when it runs (manual trigger, scheduled job) and how it safely updates `events` rows without breaking existing price history.
