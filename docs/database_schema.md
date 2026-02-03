# Database Schema & RPC Functions Guide

This document provides a detailed, non-technical explanation of how our Supabase database is structured and how the specialized "RPC functions" work to power the ticket pricing chart.

## 1. The Tables (How Data is Organized)

We use three main tables to store information. Think of these like interconnected spreadsheets.

### Table: `events`
This is our "Master List" of events.
- **`id`**: A unique fingerprint for each event in our system.
- **`te_event_id`**: The ID from the Ticket Evolution API (our data source).
- **`title`**: The name of the event (e.g., "Lakers vs Celtics").
- **`olt_url`**: The link to the event page on OnlyLocalTickets.

### Table: `event_price_hourly`
This stores the "Raw Data" we collect every hour.
- **`event_id`**: Points back to the event in the master list.
- **`timestamp`**: The exact date and hour the price was recorded.
- **`min_price`, `avg_price`, `max_price`**: The price values we calculated for that hour.
- **`listing_count`**: How many ticket listings were available.

### Table: `event_price_daily`
This is a "Summary Table" used for the long-term (All-Time) view.
- Instead of keeping every single hour forever, we "roll up" the data into a single record per day. 
- This keeps the database fast and efficient.

---

## 2. Relationships (How Tables Talk to Each Other)

We use **Foreign Keys** to link tables.
- The `event_price_hourly` table has an `event_id` column.
- This ID "points" to a specific row in the `events` table.
- **Why?** This way, we don't have to repeat the event title ("Lakers vs Celtics") thousands of times. We just store it once and reference it.

---

## 3. What are RPC Functions?

**RPC** stands for **Remote Procedure Call**. 

In simple terms: It’s a custom script that runs *inside* the database instead of in your application code.

### Why use them?
1. **Speed**: It's much faster to ask the database to "calculate the 3-day view and give me the result" than to fetch thousands of individual rows and calculate it in the browser.
2. **Simplicity**: Your frontend code (React) just makes one simple call: `get_chart_data_hourly(event_id)`. The database does the heavy lifting of filtering and sorting.

### Our RPC Functions:

#### `get_chart_data_hourly(p_event_id, p_hours_back)`
- **What it does**: Fetches the hourly prices for a specific event, going back a certain number of hours (default is 72 hours for the 3-day view).
- **Inputs**: The Event ID and how many hours back to look.
- **Output**: A clean list of `recorded_at` timestamps and prices, ready to be drawn on the chart.

#### `get_chart_data_daily(p_event_id)`
- **What it does**: Fetches every daily summary record for an event.
- **Inputs**: The Event ID.
- **Output**: The `recorded_date` data needed for the "All-Time" view of the chart.

---

## 4. Security (RLS)

**RLS (Row Level Security)** is like a bouncer for our data.
- **Public View**: Anyone can *read* the prices (so the chart works for everyone).
- **Private Edit**: Only our "Secret Key" (used by the ingestion service) is allowed to *add* or *change* price data. This prevents anyone from tampering with the historical records.
