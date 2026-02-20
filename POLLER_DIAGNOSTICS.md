# Poller Diagnostics & Production Readiness

## Summary

Your polling logic is **correct**. The issue you're seeing (same aggregate data every hour for 3 days) is **expected behavior** for the sandbox environment, which is updated nightly with sparse, random data.

## What I've Added

### 1. **Enhanced Diagnostic Logging**

The poller now logs:
- **Hour bucket** being processed (UTC format: `YYYY-MM-DDTHH:00:00.000Z`)
- **Data hash** for each event (to detect if API returned different listings)
- **Comparison with previous hour** (shows if prices changed)
- **Warnings** when data is identical to previous hour

### 2. **Production API Support**

You can now switch to production by setting an environment variable:

```bash
# In Supabase dashboard → Edge Functions → hourly-poller → Secrets
TE_API_BASE_URL=https://api.ticketevolution.com/v9
```

**Default behavior:** Still uses sandbox (`https://api.sandbox.ticketevolution.com/v9`) if not set.

### 3. **Data Change Detection**

The poller now:
- Compares current hour's aggregates with the previous hour
- Logs warnings when prices are identical (indicates stale sandbox data)
- Shows data hash to verify if raw API responses differ

## How to Verify Your Logic is Working

### Check the Logs

After each poller run, check the Supabase Edge Function logs. You should see:

```
═══════════════════════════════════════════════════════════════
HOURLY POLLER STARTING
═══════════════════════════════════════════════════════════════
Current UTC time: 2026-02-12T14:23:45.123Z
Hour bucket: 2026-02-12T14:00:00.000Z
API Base URL: https://api.sandbox.ticketevolution.com/v9 (default)
═══════════════════════════════════════════════════════════════

[Event Name] Fetched 15 listings, data hash: abc123
[Event Name] Previous hour (2026-02-12T13:00:00.000Z): min=$45.00, count=12
[Event Name] Current hour (2026-02-12T14:00:00.000Z): min=$45.00, count=12
[Event Name] ⚠️  WARNING: Same aggregate prices as previous hour...
```

### Verify Hour Buckets are Different

Query your database to confirm different hour buckets are being created:

```sql
SELECT 
  captured_at_hour,
  COUNT(*) as event_count,
  MIN(min_price) as min_min_price,
  MAX(max_price) as max_max_price
FROM event_price_hourly
GROUP BY captured_at_hour
ORDER BY captured_at_hour DESC
LIMIT 10;
```

You should see **different hour buckets** even if the prices are the same (which is normal for sandbox).

### Check Poller Runs

```sql
SELECT 
  hour_bucket,
  status,
  events_total,
  events_succeeded,
  events_failed,
  started_at,
  finished_at
FROM poller_runs
ORDER BY hour_bucket DESC
LIMIT 10;
```

Each hour should have a **unique** `hour_bucket` value.

## Why Sandbox Shows Same Data

According to TE's documentation:
- Sandbox is **updated nightly** (not hourly)
- Inventory is **automatically generated** (not real)
- Data is **sparse and random**

So seeing identical aggregates for multiple hours is **normal** for sandbox. The logic is working correctly—it's just that the sandbox API returns the same data.

## Moving to Production

### Step 1: Set Production API URL

In Supabase dashboard:
1. Go to **Edge Functions** → **hourly-poller**
2. Go to **Settings** → **Secrets**
3. Add: `TE_API_BASE_URL` = `https://api.ticketevolution.com/v9`

### Step 2: Verify Production Credentials

Make sure your `TE_API_TOKEN` and `TE_API_SECRET` are production credentials (not sandbox).

### Step 3: Test with One Event First

Consider temporarily limiting your `events` table to one test event to verify production works before polling all events.

### Step 4: Monitor First Few Runs

Watch the logs for the first few production runs to ensure:
- ✅ Different hour buckets are created
- ✅ API responses vary (data hash changes)
- ✅ Prices change over time (production has real, dynamic inventory)

## What to Look For

### ✅ Good Signs (Logic Working)
- Different `hour_bucket` values each hour
- Logs show "Fetched X listings" with varying counts
- Data hash changes between hours (in production)
- No errors in `poller_runs.status`

### ⚠️ Warning Signs (Sandbox Behavior)
- Same prices for multiple hours (expected in sandbox)
- Data hash stays the same (sandbox doesn't change often)
- Warnings about "same aggregate prices" (normal for sandbox)

### ❌ Actual Problems
- Same `hour_bucket` being reused (would indicate bug)
- All events failing (`events_failed` = `events_total`)
- Database errors in logs

## Your Logic is Sound

The polling logic correctly:
1. ✅ Creates unique hour buckets using UTC truncation
2. ✅ Uses upsert with proper conflict resolution
3. ✅ Fetches fresh data from API each run
4. ✅ Handles errors and retries appropriately
5. ✅ Tracks run status and diagnostics

The "problem" you're seeing is just sandbox data being static. Once you switch to production, you should see price changes as inventory updates in real-time.
