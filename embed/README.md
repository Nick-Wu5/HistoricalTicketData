# Ticket Pricing Embed

A JavaScript embed widget that visualizes historical ticket pricing data for events on OnlyLocalTickets.com. It displays **market price stats** (MIN / AVG / MAX), a **historical pricing chart**, and **24h price change**. The widget is designed to be embedded directly into existing MarketSnare web pages without using iframes.

---

# Overview

The embed allows event pages to display **ticket market intelligence** by showing how prices are trending over time. Listing data is **polled from the Ticket Evolution API** by a Supabase pipeline; the system consists of that **data pipeline** and a **React-based widget** that renders pricing analytics.

---

# Tech Stack

**Frontend**
- **React** — UI components
- **Vite** — build tooling and dev server
- **Recharts** — interactive area chart

**Backend / Data**
- **Ticket Evolution API** — source of listing data (polled hourly by the pipeline)
- **Supabase** — database and auth
- **Supabase Edge Functions** — serverless polling and rollups
- **PostgreSQL** — hourly and daily price aggregates

**Deployment**
- **Vercel** — serves the embed script at `https://pricing.onlylocaltickets.com/`

---

# Architecture

### Pricing Data Pipeline

A Supabase Edge Function runs on a schedule and:

- Polls the Ticket Evolution API for event listings
- Filters invalid or non-buyable listings
- Calculates pricing aggregates (min, trimmed-mean avg, max)
- Stores hourly snapshots in the database
- A separate job rolls up hourly data into daily aggregates for long-term history

### Frontend Widget

The widget loads an event ID from the page, requests pricing data from Supabase, and renders price stats and a chart. It updates automatically as new data is available (e.g. on focus or interval).

---

# How the Embed Works

1. The host page loads the embed script.
2. The script initializes one or more React widget instances bound to DOM elements.
3. Each widget requests pricing data from Supabase for its event ID.
4. The widget renders the chart and stats; the Y-axis scales to the selected metric for readability.

---

# Usage

Include the script and a mount element. The **event ID** determines which event’s pricing data is loaded.

```html
<script src="https://pricing.onlylocaltickets.com/ticket-embed.js"></script>
<div id="ticket-widget" data-event-id="123456"></div>
```

---

# Project Structure

```
embed/
  src/
    App.jsx           # Root layout, stats, chart, and data wiring
    main.jsx          # Entry; delegates to bootstrap
    bootstrap/
      index.jsx      # Mount logic, Shadow DOM, config from attributes
      styles.js      # Injects design tokens and component CSS
    api/
      client.js      # Supabase client and chart/price RPC calls
    components/
      PriceChart.jsx # Recharts area chart (metric + time-range toggles)
      PriceStats.jsx # MIN / AVG / MAX display
      ChangeBadge.jsx# 24h change badge
    styles/
      tokens.css     # CSS custom properties (colors, spacing)
      components.css # Component-level styles
  index.html         # Dev entry
  index.production.html  # Production test page
```

---

# Data Model

**Hourly data** — One row per event per hour: min, avg, max price and listing count. Used for recent (e.g. 3-day) charts.

**Daily aggregates** — Rollups of hourly data for long-term (all-time) charts and storage efficiency.

---

# Pricing Metrics

- **MIN** — Lowest available ticket price in the eligible set.
- **AVG** — 10% trimmed mean of listing prices (reduces impact of outliers).
- **MAX** — High-end market price; filtering and statistical trimming help prevent extreme listings from distorting the stats.

---

# Chart Behavior

Users can toggle:

- **Metric** — Min, Avg, or Max (which series is plotted).
- **Time range** — 3 Day (hourly) or All Time (daily).

**Y-axis scaling adapts to the selected metric**, so the chart stays readable (e.g. viewing Avg no longer scales to an extreme max listing).

---

# Mobile Design

The widget is mobile-first, responsive, and compact. Layout and axis labels adapt for smaller screens so the chart and stats remain usable on phones and tablets.

---

# Event Lifecycle

The widget detects when an event has ended (via API or data) and stops polling for updates so finished events show final state without unnecessary requests.

---

# Development

```bash
npm install
npm run dev
npm run build
```

`npm run build` produces a single embed script (`dist/ticket-embed.js`) and a production test page.

---

# Deployment

The embed script is served from:

**https://pricing.onlylocaltickets.com/**

Host the built `ticket-embed.js` (and optional test page) from this origin so partner sites can load it with the usage snippet above.
