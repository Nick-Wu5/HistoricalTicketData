# Event Manager V1 — Build TODO (Source: `docs/event_interface.md` + `docs/event_inteface_UI.md`)

Goal: a small, internal, mobile-first React app to (1) browse/search local Supabase `events`, and (2) query TicketEvolution (TE), preview results, and insert only non-duplicates by `te_event_id`.

Repo layout: this app lives at `app/event-manager/`.

---

## Scope (V1)

- **Include**
  - Existing tracked events: search local Supabase `events` by `te_event_id` (exact) and `title` (partial), display **all columns** in the `events` table
  - TE query builder: Event/Show by `event_id` OR Events/Index by `performer_id` / `venue_id` / `category_id` (+ `category_tree`)
  - TE results preview table with selection + **Already Added** duplicate indicator (based on local `events`)
  - Add Selected: insert only non-duplicates; show success / partial / no-op notifications

- **Exclude**
  - Editing existing events
  - Deleting events
  - Advanced filters / bulk refresh / metadata refresh from this screen

---

## 0) Project scaffolding (app folder + tooling)

- Create `app/event-manager/` as a standalone React app (Vite recommended).
- Add `README.md` inside `app/event-manager/` with:
  - local dev commands
  - required env vars
  - how to deploy (Vercel root dir = `app/event-manager`)
- Decide where env lives:
  - local `.env` under `app/event-manager/`
  - Vercel env vars set in dashboard
- Check: run `cd app/event-manager && npm run dev` and confirm the page loads without console errors.
- Check: confirm the README instructions work verbatim on a fresh terminal.

---

## 1) Data contracts (align with Supabase types)

Use `supabase/database.types.ts` as source of truth for `public.events` fields:
- Read/query: **all fields** in `events.Row`
- Insert: minimally requires `te_event_id` + `title`; for V1 use the same mapping approach as `scripts/populateEventsByPerformer.js` (starts_at, ends_at, polling_enabled, ended_at, updated_at, optional olt_url).

Define internal types:
- `TrackedEventRow` = `Database["public"]["Tables"]["events"]["Row"]`
- `TEEventPreviewRow` (minimal fields needed for UI): `te_event_id`, `title`, `starts_at`, optional `ends_at`, plus computed `alreadyAdded: boolean`
- Check: confirm `starts_at` / `ends_at` field names match Supabase exactly (no `start_at` / `end_at` drift).
- Check: confirm `te_event_id` is treated as a number end-to-end (no string IDs stored in component state).

---

## 2) API architecture decision (important)

TE requests must not expose secrets.

- Decide one of:
  - **Preferred**: a server-side endpoint (Supabase Edge Function or small server) that proxies TE requests
  - **Fallback** (only if acceptable): manual API key entry per session (still risky)

Document the chosen approach in `app/event-manager/README.md`.
- Check: verify the browser network tab never shows direct requests to TicketEvolution (all TE calls go through the server-side proxy).
- Check: verify no TE API key is referenced in `app/event-manager/src/**` or exposed via `import.meta.env`.
- Check (recommended automated): add a simple repo check (test or script) that fails if `TE_API_KEY` (or similar) appears in `app/event-manager/src/**`.

---

## 3) Implement the UI structure (per `event_inteface_UI.md`)

Recommended structure inside `app/event-manager/src/`:
- `app/EventManagerPage.jsx`
- `components/layout/*`
- `components/tracked-events/*`
- `components/te-query/*`
- `components/te-preview/*`
- `components/shared/*`
- `hooks/*`
- `api/*`
- `utils/*`
- `styles/*`
- Check: confirm the app renders the three sections (Tracked Events / TE Query / TE Preview) with no runtime errors.
- Check: confirm the build succeeds (`npm run build`) after the folder structure change.

---

## 4) Existing Tracked Events (Supabase) — Section A

- Build search form:
  - TE Event ID (exact)
  - Event Name (partial)
  - Provide “clear” / reset
- Query behavior:
  - If TE Event ID present: filter by `te_event_id = value`
  - Else if name present: filter by `title ILIKE %value%`
  - Else: show initial “recent events” (or show empty state until search) — choose one and document
- Results UI:
  - Display **all columns** in `public.events`
  - Include empty/loading/error states
- Check: with no filters, confirm page 1 loads, sorted by `te_event_id`, and pagination appears when the row count exceeds page size.
- Check: search by TE Event ID does exact match (returns 0 or 1 row) and does not do partial matching.
- Check: search by Event Name does a case-insensitive partial match (`ILIKE`) and handles punctuation without errors.
- Check: pagination preserves the active search filters and sort order across pages.
- Check (recommended automated): add a Playwright smoke test that loads the page and asserts the tracked-events table renders.

---

## 5) TE Query Builder — Section B

- Inputs: `event_id`, `performer_id`, `venue_id`, `category_id`, `category_tree`
- Mode rules:
  - If `event_id` present → Event/Show
  - Else → Events/Index with only provided params
- Validation:
  - At least one of: `event_id`, `performer_id`, `venue_id`, `category_id`
  - `category_tree` only valid with `category_id`
  - If `event_id` present, disable/ignore other fields
- Check: entering only `event_id` triggers Event/Show mode and disables (or ignores) the other fields.
- Check: entering only `category_tree` shows a validation error and does not send a request.
- Check: leaving all fields empty shows a validation error and does not send a request.
- Check: request payload includes only fields the user actually filled in (no empty strings).

---

## 6) TE Results Preview — Section C

- Table columns:
  - checkbox
  - `te_event_id`, `title`, `starts_at`, `ends_at` (or blank if unavailable)
  - `Already Added` (computed from local Supabase `events` by `te_event_id`)
- Duplicate handling:
  - Show indicator
  - Keep insert-time duplicate check regardless (race safety)
- Selection:
  - Select row
  - Select all visible
  - Clear selection
- Check: after a TE query, preview renders rows with stable keys (no React key warnings) and expected columns.
- Check: “Already Added” matches local Supabase events by `te_event_id`.
- Check: duplicates display the indicator and their checkbox is disabled (V1 behavior).
- Check: “Select all visible” selects only non-disabled rows in the current view.
- Check (recommended automated): unit test the duplicate-marking logic for a mixed set of TE IDs vs existing IDs.

---

## 7) Add Selected Events flow

- On “Add Selected Events”:
  - Re-fetch existing `events.te_event_id` for selected IDs
  - Split into `newEvents` and `duplicates`
  - Insert only `newEvents` rows using the mapping approach from `scripts/populateEventsByPerformer.js`
- Notifications:
  - All new → “Added X events successfully.”
  - Partial → “Added A events. Skipped B because they were already in the events table.”
  - All duplicates → “No new events were added. All selected events were already present.”
- Check: selecting a mix of new + duplicate IDs inserts only new rows and shows partial-success message with correct counts.
- Check: selecting only duplicates performs no insert and shows the “No new events…” message.
- Check: inserted rows match `populateEventsByPerformer.js` mapping (starts_at/ends_at/polling_enabled/ended_at/updated_at/olt_url).
- Check: after insertion, the Existing Tracked Events table reflects the new rows (refetch or optimistic update).
- Check (recommended automated): integration test (mocking Supabase + TE proxy) that asserts duplicates are filtered at insert time even if the preview state is stale.

---

## 8) Styling

- Reuse OLT design language from the embed where possible (tokens / spacing / typography).
- Mobile-first layout:
  - Stack sections vertically
  - Use cards/sections with clear headers
- Keep tables readable on mobile (consider “card view” fallback for rows if needed).
- Check: verify at ~390px width there’s no horizontal scroll and primary actions remain reachable.
- Check: verify keyboard navigation (Tab) shows visible focus for inputs/buttons.

---

## 9) Deployment (when ready)

- Create Vercel project for Event Manager
  - Root Directory: `app/event-manager`
  - Add env vars for Supabase + TE proxy/base URL
- Enable **Vercel Password Protection** for **Production and Preview deployments**
- Confirm no secrets are shipped to the client.
- Check: confirm both Preview and Production URLs prompt for the password before rendering any content.
- Check: confirm TE proxy works in deployed env (server-side TE requests succeed; browser does not call TE directly).
- Check: confirm Supabase service role key is not present in any client env/config; only anon key is used client-side.

---

## 10) Acceptance checklist

- Can search local events by `te_event_id` and partial `title`
- Existing events section renders **all `events` columns**
- TE query form enforces mode rules + validation
- Preview shows TE events with `Already Added` computed from local Supabase
- Add Selected inserts only non-duplicates and shows correct notification copy