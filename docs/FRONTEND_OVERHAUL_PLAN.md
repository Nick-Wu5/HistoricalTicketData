# Front-End Overhaul Plan: Historical Ticket Pricing Embed

**Status**: In Progress  
**Target**: Ship small, tested PRs (Steps 1–3 as MVP)  
**Architecture**: Vite + React + Recharts → Single-file IIFE embed

---

## Overview

This plan breaks down a full overhaul of the embeddable Historical Ticket Pricing widget into **12 incremental, testable steps**. Each step is designed to:

- Unblock the next step
- Maintain a clean, scoped architecture
- Follow `docs/style.md` as the single source of truth for visual tokens
- Preserve production stability (Shadow DOM isolation, no globals leakage)

---

## Step-by-Step Plan

### **Step 1: Bootstrap & Mount System** _(Foundation)_ ✅ COMPLETE

**Goal**: Create the embed entry point that auto-detects mount nodes, parses config, and initializes React with scoped styles.

**Files Touched**:

- `embed/src/bootstrap/index.jsx` _(new)_
- `embed/src/bootstrap/styles.js` _(new)_
- `embed/src/styles/tokens.css` _(new)_
- `embed/src/styles/components.css` _(new)_
- `embed/src/main.jsx` _(refactor: delegate to bootstrap)_
- `embed/src/App.jsx` _(full placeholder UI)_
- `embed/src/components/PriceChart.jsx` _(OLT styling + responsive height)_

**What "Done" Means**:

- `bootstrap/index.jsx` exports `initializeWidgets()` and `mount(target, config)` functions
- Auto-scans for `div[te-event-id]` on page load (with `data-event-id` fallback)
- Reads `te-event-id`, `data-mode`, `data-theme` from mount nodes
- Mounts React root into Shadow DOM with scoped styles
- No unstyled content flash (skeleton or loading state visible immediately)
- Full placeholder UI with header, KPI cards, controls, and chart

**Implemented Features**:

- **Mount attribute**: `te-event-id` (cleaner than `data-event-id`, with backwards compat)
- **Event ended detection**: Stops polling for past events (checks `ends_at`/`ended_at`)
- **24h change colors**: Green for price drop (good for buyers), red for rise (bad)
- **Responsive chart**: 320px desktop, 220px mobile (CSS-controlled via `.olt-chart-wrapper`)
- **KPI cards**: 4-column grid → 2-column tablet → 1-column mobile

**Why This First**:

- Unblocks all downstream components
- Establishes the embed contract (how third-party pages will use it)
- Ensures CSS isolation from day one

**Edge Cases / Risks**:

- Stale event IDs → graceful error message
- Multiple widgets on same page → independently managed roots
- Re-mounting on dynamic HTML → idempotency check

---

### **Step 2: API Client Layer** _(Data Fetching)_

**Goal**: Create a pluggable data adapter that can be swapped between mock and real without touching UI components.

**Files Touched**:

- `embed/src/api/client.js` _(new)_
- `embed/src/api/index.js` _(new)_

**What "Done" Means**:

- `client.js` exports `createApiClient(baseUrl, mode)` factory
- Adapter pattern: `mock` or `real` (or custom)
- Implements:
  - `fetchCurrentPrices(eventId)` → `{ min, avg, max, change_24h, last_updated, ends_at }`
  - `fetchChartData(eventId, range, metric)` → `[{ timestamp, value }, ...]`
- Mock adapter returns synthetic data (for dev)
- Real adapter hits `/api/events/:id/current` and `/api/events/:id/chart`
- Error handling: retry logic, timeout, graceful fallback

**Why This Second**:

- Abstracts data layer; UI doesn't care about HTTP details
- Enables parallel UI development with mocks
- Real backend can be integrated later without refactoring

**Edge Cases / Risks**:

- Network timeouts → show cached data or error
- Event IDs not in backend → 404 → show error
- Changed backend schema → simple version check or adapter update

---

### **Step 3: Style Tokens & CSS Bundling** _(Scoped Styles)_

**Goal**: Convert `style.md` into a CSS variable foundation and ensure zero global scope pollution.

**Files Touched**:

- `embed/src/styles/tokens.css` _(new)_
- `embed/src/styles/components.css` _(new)_
- `embed/src/styles/embed.css` _(refactor)_
- `embed/src/bootstrap/index.js` _(update: inject styles)_

**What "Done" Means**:

- `tokens.css` defines all OLT brand tokens (colors, spacing, fonts, radii, shadows)
- All component classes prefixed with `.olt-` to avoid collisions
- Root wrapper gets `.olt-pricing-embed` class
- CSS scoped in Shadow DOM or within `.olt-pricing-embed` selector
- No global CSS resets (only scoped `box-sizing: border-box` within widget)
- Media queries for responsive breakpoints (≤860px, ≤480px)

**Why This Third**:

- Ensures visual consistency across all future components
- Provides a clear "design system" for new features
- Prevents CSS creep and makes theming easier

**Edge Cases / Risks**:

- Recharts custom styling (tooltips, gridlines) → check what works in Shadow DOM
- Font loading → ensure system fonts used (no @import of external fonts)
- Dark mode tokens → prep CSS vars but defer implementation

---

### **Step 4: Event Header & CTA Component** _(UI: Header)_

**Goal**: Display event title with link and a prominent "Buy Tickets" button.

**Files Touched**:

- `embed/src/components/EventHeader.jsx` _(new)_
- `embed/src/App.jsx` _(update)_

**What "Done" Means**:

- Component accepts `{ eventTitle, eventUrl, buyUrl }`
- Renders title as link to OLT event page
- "Buy Tickets" button matches `.olt-btn--navy` style (navy bg, white text)
- Responsive: stacks on mobile (≤480px)
- Links open in new tab (`target="_blank"`)
- Accessibility: proper link semantics, button is `<a>` or `<button>`

**Risk**: None significant; simple presentational component.

---

### **Step 5: KPI Summary Component** _(UI: Statistics)_

**Goal**: Display current min/avg/max prices and 24h % change in OLT KPI card grid.

**Files Touched**:

- `embed/src/components/KPISummary.jsx` _(new)_
- `embed/src/App.jsx` _(update)_

**What "Done" Means**:

- Component accepts `{ min, avg, max, change24h }`
- Renders 4 KPI cards (Min, Avg, Max, Change) per `.olt-kpis` layout
- Responsive grid: 4 cols (≥860px) → 2 cols (≤860px) → 1 col (≤480px)
- Prices formatted as `"$1,234"` (no cents; per style.md)
- Change shows as `"+5.2%"` (green) or `"-3.1%"` (red) with directional arrow
- Loading state: skeleton placeholders (gray boxes)

**Risk**: Ensure grid layout doesn't break on Recharts responsive container.

---

### **Step 6: Chart Toggle Controls** _(UI: Controls)_

**Goal**: Create filter chips for metric selection (min/avg/max) and time range (3d/all-time).

**Files Touched**:

- `embed/src/components/ToggleControls.jsx` _(new)_
- `embed/src/App.jsx` _(update)_

**What "Done" Means**:

- Two button groups: metric toggles + range toggles
- Active state uses `.olt-tab[aria-selected="true"]` styling (navy bg)
- Layout: flex row, wraps on mobile
- Keyboard accessible (tabindex, click handlers)
- Calls parent callback on change: `onChange({ metric, range })`

**Risk**: Ensure button styles match `.olt-tabs` / `.olt-tab` from style.md.

---

### **Step 7: Enhanced Recharts Chart** _(UI: Chart)_

**Goal**: Render a clean price-over-time line chart with Recharts, styled per OLT tokens.

**Files Touched**:

- `embed/src/components/PriceChart.jsx` _(refactor)_
- `embed/src/styles/components.css` _(update)_

**What "Done" Means**:

- LineChart with multi-series (min, avg, max) or single series based on selected metric
- X-axis: time-formatted (hours for 3d, dates for all-time)
- Y-axis: currency formatted (`$1,200`)
- Custom tooltip: dark bg, white text, readable date + price
- Grid lines: subtle `.olt-gridline` color
- Line colors:
  - min: light gray
  - avg: navy (`--olt-navy-900`)
  - max: soft green (`--olt-green-500`)
- Responsive container (100% width)
- No layout shift as data loads

**Risk**: Recharts in Shadow DOM → test custom styling props; may need scoped CSS overrides.

---

### **Step 8: Loading & Skeleton States** _(UX: Loading)_

**Goal**: Show non-jarring skeleton blocks while data is fetching.

**Files Touched**:

- `embed/src/components/SkeletonLoader.jsx` _(new)_
- `embed/src/components/KPISummary.jsx` _(add isLoading mode)_
- `embed/src/components/PriceChart.jsx` _(add isLoading mode)_
- `embed/src/styles/components.css` _(add skeleton styles)_

**What "Done" Means**:

- Skeleton blocks match dimensions of real content (no layout shift)
- Subtle pulse animation (optional, per style.md)
- Shown immediately on mount (in bootstrap)
- Replaced by real content once API succeeds
- If error, skeleton is replaced by error message (no content half-load)

**Risk**: Ensure skeleton disappears cleanly without flashing.

---

### **Step 9: Error Handling & Retry** _(UX: Error States)_

**Goal**: Gracefully show errors and provide a retry mechanism.

**Files Touched**:

- `embed/src/components/ErrorBoundary.jsx` _(new)_
- `embed/src/components/ErrorMessage.jsx` _(new)_
- `embed/src/App.jsx` _(wrap in ErrorBoundary)_

**What "Done" Means**:

- Error boundary catches React errors + API errors
- Shows compact error message: "Unable to load prices. [Retry]"
- Retry button re-fetches data
- Fallback: show event header + link to buy on OLT (always functional)
- No stack traces exposed to user

**Risk**: Error boundary scope; wrap App but not bootstrap/mount logic.

---

### **Step 10: Event Ended Detection** _(Logic: Polling Stop)_

**Goal**: Stop polling/fetching once the event has passed.

**Files Touched**:

- `embed/src/App.jsx` _(add useEffect for end detection)_
- `embed/src/hooks/useEventPollControl.js` _(new)_

**What "Done" Means**:

- API returns `ends_at` (ISO datetime)
- On mount + on interval, check if `now > ends_at`
- If ended: stop all polling, show static "Event has ended" message + link to OLT
- If not ended: continue polling every 60 seconds (or configurable)
- Persist "event ended" state across re-renders

**Risk**: Time zone handling; use server time from API not client clock.

---

### **Step 11: Mobile Responsiveness** _(UX: Responsive)_

**Goal**: Ensure widget is readable on mobile devices (≤480px).

**Files Touched**:

- All CSS files _(media queries)_
- `embed/src/components/**` _(verify flex/grid layouts)_

**What "Done" Means**:

- KPI grid: 4 cols → 2 cols (≤860px) → 1 col (≤480px)
- Controls (toggles): wrap on mobile
- Header title doesn't wrap awkwardly
- Chart readable with reduced canvas
- Button sizes: still tappable (≥44px touch target)
- No horizontal scroll

**Risk**: Test on actual phone or DevTools mobile view.

---

### **Step 12: Utilities & Formatters** _(Code Quality)_

**Goal**: Centralize formatting logic (currency, dates, percentages).

**Files Touched**:

- `embed/src/utils/formatters.js` _(new)_
- `embed/src/utils/time.js` _(new)_
- Components _(import & use)_

**What "Done" Means**:

- `formatPrice(value)` → `"$1,234"` per locale
- `formatDate(timestamp, format)` → time or date depending on range
- `formatPercent(value)` → `"+5.2%"` with sign
- `getChartInterval(timeRange)` → hours or days
- All date logic uses ISO strings, server time (no client-side assumptions)

**Risk**: Locale handling; test with different languages (prep, don't implement yet).

---

### **Step 13: Vite Build Configuration Verification** _(Build)_

**Goal**: Ensure the final `ticket-embed.js` is a clean IIFE with no Node/process globals.

**Files Touched**:

- `embed/vite.config.js` _(review + adjust)_

**What "Done" Means**:

- `vite build` outputs single `dist/ticket-embed.js` file
- File is valid IIFE (no dangling requires, process refs)
- All CSS is inlined (no separate .css files)
- No async chunks or dynamic imports
- Bundle size < 200KB (gzip; acceptable for embed)
- Can be loaded with `<script src="..."></script>` on any page
- Test with `integrity` attribute (SRI) optional

**Risk**: Recharts dependencies; ensure they're bundled correctly.

---

### **Step 14: Integration Testing** _(QA: E2E)_

**Goal**: Test the embed in a real host page environment.

**Files Touched**:

- `tests/embed.integration.test.html` _(new; test page)_
- `tests/embed.integration.test.js` _(new; Playwright/Cypress tests)_

**What "Done" Means**:

- Create minimal HTML page with multiple widget mount points
- Load `ticket-embed.js` from dist
- Verify each widget mounts independently
- Check Shadow DOM isolation (host page CSS doesn't bleed in)
- Verify all features: toggles, API calls, error states
- Test on mobile viewport
- Test with Marketsnare-like host page (check for style conflicts)

**Risk**: Third-party CSS conflicts; test with CSS-heavy hosts.

---

### **Step 15: Polish & Documentation** _(Documentation)_

**Goal**: Wrap up with usage docs and edge-case handling.

**Files Touched**:

- `docs/EMBED_USAGE.md` _(new)_
- `embed/README.md` _(update)_
- `embed/src/bootstrap/index.js` _(JSDoc)_

**What "Done" Means**:

- Clear instructions on how to embed: copy script tag, add `<div data-event-id="...">`
- Config options documented (mode, theme, API base)
- Known limitations noted
- Troubleshooting section (CSS conflicts, CORS, etc.)
- JSDoc comments on public functions
- TypeScript types (optional; consider .d.ts if needed later)

---

## Architecture Overview

```
embed/src/
├── bootstrap/
│   └── index.js              # Mount system, auto-init, Shadow DOM setup
├── api/
│   ├── client.js             # Adapter factory (mock/real)
│   └── index.js              # Exports default client instance
├── components/
│   ├── App.jsx               # Root component, state management
│   ├── EventHeader.jsx       # Event title + CTA button
│   ├── KPISummary.jsx        # Min/Avg/Max/Change cards
│   ├── ToggleControls.jsx    # Metric + time range filters
│   ├── PriceChart.jsx        # Recharts wrapper
│   ├── SkeletonLoader.jsx    # Loading placeholder
│   ├── ErrorMessage.jsx      # Error UI
│   └── ErrorBoundary.jsx     # Error boundary HOC
├── hooks/
│   └── useEventPollControl.js # Logic for polling + event-ended detection
├── utils/
│   ├── formatters.js         # formatPrice, formatDate, formatPercent
│   └── time.js               # Date/interval utilities
├── styles/
│   ├── tokens.css            # CSS variables (OLT brand)
│   ├── components.css        # Component styles (scoped)
│   └── embed.css             # Embed-specific overrides
├── main.jsx                  # Entry point (delegates to bootstrap)
└── index.html                # Dev server template
```

---

## Data Contract (API)

**Assumption**: Backend provides two endpoints:

```
GET /api/events/:event_id/current
Response: {
  "title": string,
  "olt_url": string,
  "min_price": number,
  "avg_price": number,
  "max_price": number,
  "change_24h": number (percent, e.g., 5.2),
  "last_updated": ISO8601 datetime,
  "ends_at": ISO8601 datetime,
  "ended_at": ISO8601 datetime | null
}

GET /api/events/:event_id/chart?range=3d|all&metric=min|avg|max
Response: [
  { "timestamp": ISO8601, "value": number },
  ...
]
```

**Fallback**: If backend is unavailable, mock adapter returns synthetic data (for dev/demo).

---

## Non-Negotiables (Recap)

- ✅ No iframe
- ✅ Match `docs/style.md` exactly
- ✅ Mobile friendly (test on ≤480px)
- ✅ Stop polling after event ends
- ✅ Shadow DOM isolation (no CSS leakage)
- ✅ Single-file IIFE output
- ✅ No Node/process globals in bundle
- ✅ Acceptable bundle size (<250KB gzip)

---

## Success Criteria

**MVP (Steps 1–3)**:

- Bootstrap mounts independently
- API client is pluggable (mock works)
- Styles are scoped and don't break host pages

**Full Feature (Steps 4–12)**:

- All UI components render
- Mobile responsive
- Error handling works
- Event-ended detection stops polling

**Production Ready (Steps 13–15)**:

- Single-file embed tested on host pages
- Build is clean (no warnings)
- Documentation is clear

---

## Risk Mitigation

| Risk                                  | Mitigation                                                                |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Recharts in Shadow DOM styling issues | Test custom CSS props early (Step 7); fallback to simpler chart if needed |
| Third-party CSS conflicts             | Use `.olt-` prefix exclusively; test on Marketsnare mock page             |
| Event ID not in backend               | API layer returns 404; error boundary shows graceful message              |
| Bundle size explosion                 | Audit Recharts deps; consider precompressed output                        |
| Time zone bugs                        | Use ISO strings throughout; rely on server time from API                  |
| Mobile layout breaks                  | Implement media queries early; test on DevTools                           |

---

## Rollout Plan

**Phase 1 (Week 1)**: Ship Steps 1–3 (foundation)

- Bootstrap + mount system
- API client adapter
- Style tokens

**Phase 2 (Week 2)**: Ship Steps 4–7 (UI components)

- Header, KPI, controls, chart
- All integrated

**Phase 3 (Week 3)**: Ship Steps 8–15 (polish)

- Loading, error, mobile, utils
- Testing, docs

**Cutover**: Swap old embed for new in production; monitor for errors.
