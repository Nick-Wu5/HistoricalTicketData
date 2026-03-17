-- Migration: get_24h_changes and update get_current_prices to return per-metric 24h change
-- 1. Create get_24h_changes(p_te_event_id) returning change_24h_min, change_24h_avg, change_24h_max
-- 2. Replace get_current_prices to return those three columns (drop single change_24h)
-- 3. Drop get_24h_change(integer)

-- ---------------------------------------------------------------------------
-- 1. Create get_24h_changes: one row with min/avg/max 24h percentage changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_24h_changes(p_te_event_id integer)
RETURNS TABLE(change_24h_min numeric, change_24h_avg numeric, change_24h_max numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  target_hour timestamptz := date_trunc('hour', now());
  curr_min numeric;
  curr_avg numeric;
  curr_max numeric;
  prev_min numeric;
  prev_avg numeric;
  prev_max numeric;
  ch_min numeric;
  ch_avg numeric;
  ch_max numeric;
BEGIN
  -- Latest bucket
  SELECT min_price, avg_price, max_price INTO curr_min, curr_avg, curr_max
  FROM public.event_price_hourly
  WHERE te_event_id = p_te_event_id
  ORDER BY captured_at_hour DESC
  LIMIT 1;

  -- 24h-ago bucket (latest at or before target_hour - 24h)
  SELECT min_price, avg_price, max_price INTO prev_min, prev_avg, prev_max
  FROM public.event_price_hourly
  WHERE te_event_id = p_te_event_id
    AND captured_at_hour <= target_hour - interval '24 hours'
  ORDER BY captured_at_hour DESC
  LIMIT 1;

  -- Compute each metric; null when current or previous is null or previous is 0
  ch_min := CASE
    WHEN curr_min IS NULL OR prev_min IS NULL OR prev_min = 0 THEN NULL
    ELSE round(((curr_min - prev_min) / prev_min) * 100, 2)
  END;
  ch_avg := CASE
    WHEN curr_avg IS NULL OR prev_avg IS NULL OR prev_avg = 0 THEN NULL
    ELSE round(((curr_avg - prev_avg) / prev_avg) * 100, 2)
  END;
  ch_max := CASE
    WHEN curr_max IS NULL OR prev_max IS NULL OR prev_max = 0 THEN NULL
    ELSE round(((curr_max - prev_max) / prev_max) * 100, 2)
  END;

  RETURN QUERY SELECT ch_min, ch_avg, ch_max;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Replace get_current_prices: keep min/avg/max/listing_count/last_updated,
--    add change_24h_min, change_24h_avg, change_24h_max from get_24h_changes
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_current_prices(integer);

CREATE FUNCTION get_current_prices(p_te_event_id integer)
RETURNS TABLE (
  min_price numeric,
  avg_price numeric,
  max_price numeric,
  listing_count integer,
  change_24h_min numeric,
  change_24h_avg numeric,
  change_24h_max numeric,
  last_updated timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  rec record;
  ch record;
BEGIN
  -- Latest hourly row for this event
  SELECT h.min_price, h.avg_price, h.max_price, h.listing_count, h.captured_at_hour
    INTO rec
  FROM public.event_price_hourly h
  WHERE h.te_event_id = p_te_event_id
  ORDER BY h.captured_at_hour DESC
  LIMIT 1;

  -- Per-metric 24h changes (ch may be null if no comparison point)
  SELECT * INTO ch FROM get_24h_changes(p_te_event_id) LIMIT 1;

  IF rec IS NOT NULL THEN
    min_price := rec.min_price;
    avg_price := rec.avg_price;
    max_price := rec.max_price;
    listing_count := rec.listing_count;
    last_updated := rec.captured_at_hour;
  ELSE
    min_price := NULL;
    avg_price := NULL;
    max_price := NULL;
    listing_count := NULL;
    last_updated := NULL;
  END IF;

  IF ch IS NOT NULL THEN
    change_24h_min := ch.change_24h_min;
    change_24h_avg := ch.change_24h_avg;
    change_24h_max := ch.change_24h_max;
  ELSE
    change_24h_min := NULL;
    change_24h_avg := NULL;
    change_24h_max := NULL;
  END IF;
  RETURN NEXT;
  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Drop old single-metric function
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_24h_change(integer);
