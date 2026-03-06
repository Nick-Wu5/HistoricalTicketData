-- Migration: Add diagnostic columns to poller_run_events
-- Purpose: Track where listings are filtered out so we can understand why an event
--          temporarily had no eligible listings.
--
-- New columns:
--   raw_listing_count     - Total listings returned from TE API
--   event_listing_count   - Listings after filtering to type=event with valid prices
--   quantity_match_count  - Listings after filtering for quantity >= 1 (general market)
--   buyable_listing_count - Listings after excluding non-buyable notes
--   skip_reason           - Why the event was skipped (if status = 'skipped')

-- Add diagnostic counter columns
ALTER TABLE poller_run_events
ADD COLUMN IF NOT EXISTS raw_listing_count integer;

ALTER TABLE poller_run_events
ADD COLUMN IF NOT EXISTS event_listing_count integer;

ALTER TABLE poller_run_events
ADD COLUMN IF NOT EXISTS quantity_match_count integer;

ALTER TABLE poller_run_events
ADD COLUMN IF NOT EXISTS buyable_listing_count integer;

-- Add skip_reason column for structured debugging
ALTER TABLE poller_run_events
ADD COLUMN IF NOT EXISTS skip_reason text;

-- Add comment explaining the columns
COMMENT ON COLUMN poller_run_events.raw_listing_count IS 'Total listings returned from TE API before any filtering';
COMMENT ON COLUMN poller_run_events.event_listing_count IS 'Listings after filtering to type=event with valid prices';
COMMENT ON COLUMN poller_run_events.quantity_match_count IS 'Listings after filtering for quantity >= 1 (general market pricing)';
COMMENT ON COLUMN poller_run_events.buyable_listing_count IS 'Listings after excluding non-buyable notes (rejected/pending)';
COMMENT ON COLUMN poller_run_events.skip_reason IS 'Structured reason why event was skipped: no_te_listings, no_event_listings, no_valid_quantity, no_buyable_listings';

-- Create index for querying skipped events by reason
CREATE INDEX IF NOT EXISTS idx_poller_run_events_skip_reason
ON poller_run_events (skip_reason)
WHERE skip_reason IS NOT NULL;
