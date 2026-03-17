# Event Manager React App — Component & File Structure Spec

This spec defines the initial React structure for a **mobile-first internal Event Manager interface** that:

1. Searches the local Supabase `events` table
2. Queries TicketEvolution events
3. Previews results
4. Prevents duplicates by `te_event_id`
5. Adds selected new events into the local `events` table

The UI should reuse the existing OLT design system and visual language.

---

# App Scope

## Primary workflows

- Search existing tracked events in Supabase
- Query TE by:
  - `event_id`
  - `performer_id`
  - `venue_id`
  - `category_id`
  - `category_tree`
- Preview matching events
- Select one or many events
- Add only non-duplicate events
- Notify user when duplicates were skipped

---

# Recommended Top-Level File Structure

```txt
src/
  app/
    EventManagerPage.jsx

  components/
    layout/
      PageShell.jsx
      SectionCard.jsx
      SectionHeader.jsx

    tracked-events/
      TrackedEventsSection.jsx
      TrackedEventsSearchForm.jsx
      TrackedEventsResults.jsx
      TrackedEventCard.jsx
      TrackedEventsTable.jsx

    te-query/
      TEQuerySection.jsx
      TEQueryForm.jsx
      QueryModeHint.jsx

    te-preview/
      TEPreviewSection.jsx
      TEPreviewActions.jsx
      TEPreviewResults.jsx
      TEPreviewCard.jsx
      TEPreviewTable.jsx

    shared/
      TextInput.jsx
      CheckboxField.jsx
      Button.jsx
      Badge.jsx
      EmptyState.jsx
      NotificationBanner.jsx
      LoadingState.jsx

  hooks/
    useTrackedEventsSearch.js
    useTEEventQuery.js
    useTEPreviewSelection.js
    useAddSelectedEvents.js

  api/
    supabaseClient.js
    trackedEvents.js
    teEvents.js
    eventInsert.js

  utils/
    eventMappers.js
    duplicateUtils.js
    queryBuilders.js
    formatters.js

  styles/
    tokens.css
    event-manager.css
```
