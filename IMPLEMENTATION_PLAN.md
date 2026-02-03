# Historical Ticket Pricing Embed - Implementation Plan

Production-grade JavaScript embed system for displaying historical ticket pricing charts within MarketSnare CMS.

## User Review Required

> [!IMPORTANT]
> **Supabase Project Setup Required**
> - You'll need to create a Supabase project and provide the project URL and anon key
> - Database migrations will be provided but need to be run in your Supabase dashboard
> - Edge Functions or external hosting needed for the data ingestion service (cannot run client-side due to API credentials)

> [!IMPORTANT]
> **Ticket Evolution API Credentials**
> - You'll need TE API token and secret for HMAC-SHA256 signature generation
> - These must be stored securely server-side (never in the embed)
> - Confirm you have API access and rate limits

> [!WARNING]
> **Hosting Strategy**
> - **Widget Bundle**: Will be hosted at `pricing.onlylocaltickets.com` subdomain
> - **Data Ingestion Service**: Requires server-side hosting (Supabase Edge Functions, AWS Lambda, or similar)
> - **Embed Usage**: Same widget code is hosted once, different event IDs passed via HTML data attributes
> - See "Hosting Strategy" section below for subdomain setup options

> [!IMPORTANT]
> **Event Data Source**
> - The system assumes you have a way to identify the 104 events to track
> - Need event IDs from Ticket Evolution API
> - Need mapping to OnlyLocalTickets event page URLs
> - Confirm how this event list will be maintained

---

## Hosting Strategy

### Widget Bundle Hosting

The widget JavaScript bundle will be hosted at **`pricing.onlylocaltickets.com`**. The same bundle is used across all event pages—event-specific data is passed via HTML data attributes.

**Subdomain Setup Options:**

1. **Subdomain → CDN (Recommended)**
   - Point `pricing.onlylocaltickets.com` to a CDN (Cloudflare, AWS CloudFront, etc.)
   - Upload built widget files to CDN storage
   - Benefits: Fast global delivery, automatic caching, HTTPS included
   - Widget URL: `https://pricing.onlylocaltickets.com/ticket-embed.js`

2. **Subdomain → Vercel/Netlify with Custom Domain**
   - Deploy widget to Vercel/Netlify
   - Add CNAME record: `pricing.onlylocaltickets.com` → `cname.vercel-dns.com`
   - Configure custom domain in Vercel/Netlify dashboard
   - Benefits: Easy deployment, automatic SSL, global CDN
   - Widget URL: `https://pricing.onlylocaltickets.com/ticket-embed.js`

3. **Subdomain → Traditional Web Server**
   - Point subdomain to nginx/Apache server
   - Upload widget files to server's static directory
   - Configure HTTPS with Let's Encrypt
   - Simpler but less performant for global traffic
   - Widget URL: `https://pricing.onlylocaltickets.com/ticket-embed.js`

### Data Ingestion Service Hosting

The ingestion service requires server-side execution (cannot run in browser due to API credentials).

**Recommended Options:**

1. **Supabase Edge Functions** (Recommended if using Supabase)
   - Native integration with Supabase database
   - Deno runtime
   - Built-in cron scheduling

2. **AWS Lambda + EventBridge**
   - Highly scalable
   - EventBridge for cron scheduling
   - Good for complex workflows

3. **Vercel Serverless Functions + Vercel Cron**
   - Simple deployment alongside widget
   - Limited to 10-second execution on free tier

### Embed Code Specification

Each event page on OnlyLocalTickets will include a simple HTML snippet with the event-specific ID:

```html
<!-- Example: Lakers vs Celtics game page -->
<div id="ticket-widget" data-event-id="lakers-celtics-2024-03-15"></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

The widget JavaScript reads the `data-event-id` attribute and fetches the corresponding data from Supabase. This means:
- ✅ Same widget code hosted once at `pricing.onlylocaltickets.com`
- ✅ Different event data per page
- ✅ Simple for content editors to add
- ✅ No complex configuration needed

---

## Proposed Changes

### Database Layer (Supabase)

#### [NEW] [supabase_schema.sql](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/database/supabase_schema.sql)

Complete database schema including:
- `events` table: Store event metadata (TE event ID, title, OnlyLocalTickets URL)
- `event_price_hourly` table: Hourly price aggregates (min/avg/max, listing count, price basis)
- `event_price_daily` table: Daily rollup aggregates
- Indexes for efficient querying by event_id and time ranges
- RLS policies for public read access (write restricted to service role)

#### [NEW] [supabase_rpc_functions.sql](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/database/supabase_rpc_functions.sql)

PostgreSQL functions for:
- `get_chart_data_hourly(event_id, hours_back)`: Fetch hourly data for 3-day view
- `get_chart_data_daily(event_id)`: Fetch all daily data for all-time view
- `get_current_prices(event_id)`: Get latest min/avg/max values
- `get_24h_change(event_id)`: Calculate 24-hour percentage change

---

### Data Ingestion Service

#### [NEW] [ingestion/te-api-client.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/ingestion/te-api-client.js)

Ticket Evolution API client with:
- HMAC-SHA256 signature generation
- Proper query parameter sorting
- Trailing '?' handling for parameterless GET requests
- Request/response logging
- Error handling and retry logic

#### [NEW] [ingestion/price-aggregator.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/ingestion/price-aggregator.js)

Price aggregation logic:
- Filter out non-ticket listings (parking, tailgates)
- Calculate min/avg/max from listing prices
- Track listing count and price basis (e.g., "ticket" vs "each")
- Handle edge cases (zero listings, missing data)

#### [NEW] [ingestion/hourly-poller.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/ingestion/hourly-poller.js)

Hourly polling orchestrator:
- Stagger requests across the hour (104 events ÷ 60 minutes ≈ 1-2 per minute)
- Fetch listings for each event
- Compute aggregates
- Insert into `event_price_hourly` table
- Error handling and logging

#### [NEW] [ingestion/daily-rollup.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/ingestion/daily-rollup.js)

Daily aggregation service:
- Run once per day (e.g., midnight UTC)
- Aggregate hourly data into daily records
- Store in `event_price_daily` table
- Clean up hourly data older than 14 days

#### [NEW] [ingestion/deploy-guide.md](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/ingestion/deploy-guide.md)

Deployment instructions for:
- Supabase Edge Functions approach
- AWS Lambda + EventBridge approach
- Alternative hosting options

---

### API Layer (Supabase Edge Functions or REST API)

#### [NEW] [api/chart-data.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/api/chart-data.js)

REST endpoint for chart data:
- `GET /api/chart-data?event_id=X&range=3day|alltime`
- Returns formatted data for charting library
- Includes current prices and 24h change
- CORS headers for embed usage

---

### Frontend Embed (React + Vite)

#### [NEW] [embed/package.json](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/package.json)

Dependencies:
- React 18
- Recharts (charting library)
- Vite (build tool)
- @supabase/supabase-js (optional, if direct Supabase access)

#### [NEW] [embed/vite.config.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/vite.config.js)

Vite configuration for library mode:
- Output format: IIFE (immediately invoked function expression)
- Single bundle file
- External dependencies inlined
- Production optimizations

#### [NEW] [embed/src/bootstrap.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/bootstrap.js)

Embed bootstrap script:
- Create Shadow DOM container
- Inject styles into Shadow DOM
- Mount React app
- Parse data attributes from script tag (event_id, theme, etc.)
- Defensive initialization (check for existing instances)

#### [NEW] [embed/src/App.jsx](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/App.jsx)

Main React component:
- Event title with link to OnlyLocalTickets
- Current price display (Min/Avg/Max)
- Toggle buttons (Min/Avg/Max, 3-day/All-time)
- Chart component
- Buy/View Tickets button
- Loading and error states

#### [NEW] [embed/src/components/PriceChart.jsx](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/components/PriceChart.jsx)

Chart component using Recharts:
- Line chart with responsive design
- Toggle between min/avg/max data series
- X-axis: time (hourly or daily)
- Y-axis: price ($)
- Tooltip with formatted data
- Styling isolated within Shadow DOM

#### [NEW] [embed/src/components/PriceDisplay.jsx](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/components/PriceDisplay.jsx)

Current price display component:
- Show current Min/Avg/Max values
- Display 24-hour percentage change (with up/down indicator)
- Responsive layout

#### [NEW] [embed/src/hooks/useChartData.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/hooks/useChartData.js)

Custom React hook for data fetching:
- Fetch from Supabase or API endpoint
- Handle loading/error states
- Refetch on toggle changes
- Cache management

#### [NEW] [embed/src/styles/embed.css](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/src/styles/embed.css)

Scoped styles for Shadow DOM:
- Reset styles to prevent host page interference
- Component-specific styles
- Responsive design
- Theme variables (colors, fonts, spacing)

#### [NEW] [embed/public/embed-loader.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/embed/public/embed-loader.js)

Minimal loader script for CMS integration. Each event page includes this snippet with a unique `data-event-id`:

**Example 1: Lakers vs Celtics**
```html
<div id="ticket-widget" data-event-id="lakers-celtics-2024-03-15"></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

**Example 2: Warriors vs Nets**
```html
<div id="ticket-widget" data-event-id="warriors-nets-2024-03-20"></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

**Example 3: With optional theme parameter**
```html
<div 
  id="ticket-widget" 
  data-event-id="bulls-heat-2024-04-10"
  data-theme="dark"
></div>
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
```

The widget bootstrap script reads these data attributes and:
1. Fetches event metadata from Supabase using the `event_id`
2. Loads the appropriate chart data
3. Renders the component within a Shadow DOM for style isolation

---

### Configuration & Documentation

#### [NEW] [.env.example](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/.env.example)

Environment variables template:
- Supabase URL and keys
- Ticket Evolution API credentials
- API endpoint URLs
- Deployment settings

#### [NEW] [README.md](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/README.md)

Comprehensive documentation:
- Project overview
- Architecture diagram
- Setup instructions
- Deployment guide
- Usage examples
- Troubleshooting

#### [NEW] [docs/architecture.md](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/docs/architecture.md)

Technical architecture documentation:
- System components diagram
- Data flow (TE API → Ingestion → Supabase → Embed)
- Shadow DOM isolation strategy
- Scaling considerations
- Edge cases and handling

#### [NEW] [docs/cms-integration.md](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/docs/cms-integration.md)

MarketSnare CMS integration guide:
- How to add embed via Code Blocks
- Configuration options
- Styling customization
- Troubleshooting common issues

---

### Testing & Quality Assurance

#### [NEW] [tests/ingestion.test.js](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/tests/ingestion.test.js)

Unit tests for ingestion logic:
- TE API signature generation
- Price aggregation accuracy
- Edge case handling (zero listings, missing data)

#### [NEW] [tests/embed.test.html](file:///Users/nickwu/Downloads/ProgrammingProjects/HistoricalTicketData/tests/embed.test.html)

Manual test page for embed:
- Simulate different host page environments
- Test styling isolation
- Verify Shadow DOM functionality
- Multiple embeds on same page

---

## Verification Plan

### Automated Tests

1. **Ingestion Service Tests**
   ```bash
   npm test -- ingestion.test.js
   ```
   - Verify TE API signature generation matches expected format
   - Test price aggregation with sample data
   - Validate filtering of non-ticket listings

2. **Database Query Tests**
   - Test RPC functions in Supabase SQL editor
   - Verify indexes are used (check query plans)
   - Validate RLS policies

3. **Embed Build**
   ```bash
   cd embed && npm run build
   ```
   - Verify single bundle output
   - Check bundle size (should be < 200KB gzipped)
   - Validate IIFE format

### Manual Verification

1. **Data Ingestion Accuracy**
   - Run hourly poller for 1 event
   - Compare computed min/avg/max with manual calculation from TE API response
   - Verify listing count matches filtered listings
   - Check hourly data appears in Supabase table

2. **Daily Rollup**
   - Run daily rollup after 24 hours of hourly data
   - Verify daily aggregates are correct
   - Confirm hourly data cleanup after 14 days

3. **Embed Functionality**
   - Host embed bundle on test CDN
   - Add to test HTML page (not MarketSnare yet)
   - Verify chart renders correctly
   - Test all toggles (Min/Avg/Max, 3-day/All-time)
   - Verify 24h change calculation
   - Test Buy Tickets button link

4. **MarketSnare CMS Integration**
   - Add embed via Code Block in MarketSnare
   - Verify rendering in preview and published page
   - Test on different browsers (Chrome, Firefox, Safari)
   - Verify styling isolation (no conflicts with host page)
   - Test multiple embeds on same page

5. **Performance Testing**
   - Measure embed load time (should be < 2s on 3G)
   - Check API response times (should be < 500ms)
   - Verify no memory leaks (leave page open for 1 hour)

6. **Edge Cases**
   - Event with zero listings (should show "No data available")
   - Event with only 1 listing (min/avg/max all same)
   - New event with < 3 days of data (chart should still render)
   - API endpoint down (should show error message)
   - Slow network (should show loading state)

---

## Implementation Phases

### Phase 1: Database & API Foundation (Days 1-2)
- Set up Supabase project
- Create database schema
- Implement RPC functions
- Create sample data for testing

### Phase 2: Data Ingestion (Days 3-5)
- Build TE API client
- Implement price aggregation logic
- Create hourly poller
- Test with 1-2 events
- Deploy ingestion service

### Phase 3: Frontend Embed (Days 6-8)
- Initialize Vite project
- Build React components
- Implement Shadow DOM bootstrap
- Create chart with Recharts
- Test locally

### Phase 4: Integration & Testing (Days 9-10)
- Deploy embed bundle to CDN
- Test in MarketSnare CMS
- Verify data accuracy
- Performance optimization
- Bug fixes

### Phase 5: Production Rollout (Day 11)
- Deploy for all 104 events
- Monitor ingestion service
- Verify chart data across events
- Documentation finalization
