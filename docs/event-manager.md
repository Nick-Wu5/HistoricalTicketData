# Event Manager

The Event Manager is an internal admin interface for managing which events are tracked by the pricing system. It supports two workflows:

1. **Tracked Events** — Search and review events already stored in the Supabase `events` table.
2. **Add Events** — Query TicketEvolution, preview results, and add new events while preventing duplicates.

---

## Workflows

### Tracked Events

A searchable table backed by the Supabase `events` table. Users can search by `te_event_id` or partial event title to confirm what is already being tracked.

All columns from the `events` table are displayed.

### Add Events

Users query TicketEvolution using one of two modes:

- **Single Event** — Fetch by `event_id` (`GET /v9/events/:event_id`).
- **Bulk Fetch** — Fetch by `performer_id`, `venue_id`, `category_id`, and/or `category_tree` (`GET /v9/events`). Only parameters the user entered are included.

Results appear in a preview table with checkboxes. Each row shows a `Tracked` / `Not tracked` status based on whether `te_event_id` already exists locally.

#### Add Selected Flow

1. User selects rows (or "Select All").
2. Clicks "Add Selected Events."
3. Selected IDs are compared against existing `events.te_event_id` values.
4. Only non-duplicates are inserted.
5. A toast notification summarizes the outcome (all added, partial, or all duplicates).

### Validation Rules

- At least one query parameter is required.
- `category_tree` only applies when `category_id` is provided.
- If `event_id` is present, bulk fields are disabled.
- No event is inserted if its `te_event_id` already exists.

---

## Access Control

The Event Manager is deployed on Vercel with Password Protection enabled for production and preview deployments. TicketEvolution API calls are proxied through Supabase Edge Functions to keep credentials server-side.

Authentication within the app uses email/password sign-in via Supabase Auth, guarded by an `AuthGate` component.

---

## File Structure

```
src/
  app/
    AuthGate.jsx
    EventManagerPage.jsx
    LoginPage.jsx

  api/
    addSelectedEvents.js
    teProxy.js
    trackedEvents.js

  components/
    layout/
      PageShell.jsx

    shared/
      Button.jsx
      EmptyState.jsx
      Pagination.jsx
      TextInput.jsx
      Toast.jsx
      ToggleField.jsx
      TruncatedCell.jsx

    tracked-events/
      TrackedEventsSection.jsx
      TrackedEventsSearchForm.jsx
      TrackedEventsResults.jsx

    te-query/
      TEQuerySection.jsx
      TEQueryForm.jsx

    te-preview/
      TEPreviewSection.jsx
      TEPreviewActions.jsx
      TEPreviewResults.jsx

  hooks/
    useViewportPageSize.js

  styles/
    tokens.css
    event-manager.css
```

---

## UI Design Principles

- **Hierarchy**: Page title is the strongest visual anchor; section headers are lighter; body content (forms, tables, actions) is lowest emphasis.
- **Containers**: Outer `PageShell` and section containers. Inner content feels embedded — no nested bordered boxes.
- **Spacing**: Token-driven vertical rhythm (OLT spacing variables). Reduced inner padding in dense areas like tables.
- **Mobile-first**: Stacked layout on small screens. Tap targets remain usable. Tables handle horizontal overflow gracefully.
- **Copy**: User-intent language over API jargon (e.g. "Fetch events" not "Run TE query"; status labels "Tracked" / "Not tracked").

---

## Data Flow Summary

### Tracked Events Search

User enters search term → query Supabase `events` → render matching tracked events.

### TicketEvolution Query

User enters TE parameters → call TE Event/Show or Events/Index via Edge Function proxy → render preview rows.

### Add Selected

User selects rows → compare selected `te_event_id`s against Supabase → insert only non-duplicates → show result notification.
