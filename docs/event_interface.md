# TicketEvolution Event Intake + Existing Events Management (V1 Scope)

This interface should support two related workflows:

1. **Preview and add new events from TicketEvolution**
2. **Search and review events already stored in the Supabase `events` table**

The goal is to make it easy to:

- query TicketEvolution events by known IDs
- preview results before insertion
- avoid duplicate inserts
- notify users when some selected events were skipped because they already exist

---

# Core Features

## 1. TicketEvolution Query + Preview

Allow users to query TicketEvolution using either:

### Mode A — Event / Show

Input:

- `event_id`

Use:

- `GET /v9/events/:event_id`

### Mode B — Events / Index

Inputs:

- `performer_id`
- `venue_id`
- `category_id`
- `category_tree`

Use:

- `GET /v9/events`

Only include the parameters the user entered.

---

## 2. Existing Events Search (Supabase)

The interface should also include a section for searching the current contents of the local Supabase `events` table.

Users should be able to search existing tracked events by:

- `te_event_id`
- `title` / event name

This allows users to quickly confirm whether an event is already being tracked.

---

# UI Layout

## Section A — Existing Tracked Events

A searchable table backed by the Supabase `events` table.

### Search fields

- TE Event ID
- Event Name

### Behavior

- search by exact `te_event_id`
- search by partial event title / name
- display matching stored events

### Displayed columns (V1)

Display **all fields** from the local Supabase `events` table.

Purpose:

- let users confirm what is already in the system
- reduce accidental duplicate adds

---

## Section B — TicketEvolution Query Builder

Inputs:

- `event_id`
- `performer_id`
- `venue_id`
- `category_id`
- `category_tree`

### Query mode rules

- If `event_id` is present → use **Event / Show**
- Otherwise → use **Events / Index**

Validation:

- `category_tree` only applies if `category_id` is present
- If `event_id` is present, ignore or disable the other TE query fields

---

## Section C — TicketEvolution Results Preview

After running the TE query, display all matching TE events in a preview table with checkboxes.

### Suggested columns

- Checkbox
- `te_event_id`
- `title`
- `starts_at`
- `ends_at`
- `Already Added` (duplicate indicator from local Supabase `events`)

---

# Duplicate Validation

## Source of truth

Duplicate checking should be done against the local Supabase `events` table using:

- `te_event_id`

## Validation rule

An event should be considered a duplicate if its `te_event_id` already exists in Supabase.

---

# Preview Table Duplicate Handling

For each TE event returned in the preview table:

- Check whether `te_event_id` already exists in the local `events` table
- Mark duplicate rows visually

### Recommended UI behavior

- add an `Already Added` column or badge
- disable the checkbox for duplicate rows (and highlight row with faint indicator)

Recommended display values:

- `Already Added`
- `New`

---

# Add Selected Events Flow

## User flow

1. User runs TE query
2. Preview table appears
3. User selects individual rows or clicks **Select All**
4. User clicks **Add Selected Events**

## Insert behavior

Before insert:

- compare selected `te_event_id`s against existing Supabase `events.te_event_id`s
- split selection into:
  - `newEvents`
  - `duplicates`

### Result behavior

- Insert only `newEvents`
- Do not insert duplicates
- Show a user notification summarizing the outcome

---

# User Notifications

## Success notification

If all selected events are new:

- “Added 5 events successfully.”

## Partial success notification

If some were duplicates:

- “Added 3 events. Skipped 2 because they were already in the events table.”

## Full duplicate notification

If all selected events already exist:

- “No new events were added. All selected events were already present.”

---

# Select All Behavior

The preview table should support:

- Select row
- Select all
- Clear selection

Recommended behavior:

- “Select All” should select only rows currently visible in the preview
- Duplicate rows may either:
  - be excluded automatically from selection
  - or be selectable but skipped during add

For V1, simplest behavior:

- allow selection
- validate at insert time
- notify about skipped duplicates

---

# Insert Mapping

When inserting selected TE events into the Supabase `events` table, use /Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/scripts/populateEventsByPerformer.js for reference

## Note: The **Existing Tracked Events** table should not compute or derive fields like `ends_at`—it should display values directly from the local Supabase `events` rows.

# Recommended Backend/API Behavior

## 0. Access control (deployment)

This is intended to be an internal admin interface. When deployed on Vercel, enable **Password Protection** for **Production and Preview deployments** so the entire site is blocked by default.

Note: Password protection does not make it safe to call TicketEvolution directly from the browser—TE requests should still be made through a trusted server-side proxy (e.g. Supabase Edge Function).

## 1. Existing events lookup

Add a Supabase query to load current tracked events:

- search by `te_event_id`
- search by partial title

## 2. Duplicate check before insert

When user confirms add:

- fetch existing `te_event_id`s for selected events
- compute difference
- insert only missing IDs

This should happen server-side or in a trusted backend layer if possible.

---

# Suggested Data Flow

## Existing Events Search

User enters search term  
→ query Supabase `events`  
→ render matching tracked events

## TicketEvolution Query

User enters TE params  
→ call TE Event / Show or Events / Index  
→ render preview rows

## Add Selected

User selects rows  
→ compare selected `te_event_id`s against Supabase  
→ insert only non-duplicates  
→ show result notification

---

# Validation Rules

## Required for TE query

At least one of:

- `event_id`
- `performer_id`
- `venue_id`
- `category_id`

## `category_tree`

Only valid when `category_id` is provided.

## Duplicate prevention

No event should be inserted if `te_event_id` already exists in Supabase.

---

# Recommended V1 Simplicity

For the first version:

### Include:

- existing events search
- TE query form
- TE preview table with checkboxes
- duplicate detection by `te_event_id`
- partial-success notifications

### Exclude for now:

- editing existing events
- deleting tracked events
- advanced filters
- bulk metadata refresh from this screen

---

# Summary

This interface should function as both:

## A. Existing tracked events browser

Search local Supabase `events` by:

- `te_event_id`
- event name

## B. New TE event intake tool

Query TE using:

- `event_id`
- `performer_id`
- `venue_id`
- `category_id`
- `category_tree`

Then:

- preview matching events
- select rows
- add only non-duplicate events
- notify users when duplicates were skipped

This gives you a clean, practical V1 event management workflow.
