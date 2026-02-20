#!/usr/bin/env node
/**
 * Demo script: Hourly Poller logic
 *
 * Mimics the hourly poller's flow for boss demos:
 *   1. Fetch listings from TE sandbox API
 *   2. Filter to eligible (type=event, valid price/qty/splits, OLT buyable notes)
 *   3. Compute min/avg/max → event_price_hourly
 *
 * Usage:
 *   node demo-poller-logic.js <event_id>
 *   node demo-poller-logic.js <event_id> --owned-only
 *
 * Example:
 *   node demo-poller-logic.js 982605
 *   node demo-poller-logic.js 982605 --owned-only
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// Load .env from project root (same vars as hourly-poller: TE_API_TOKEN, TE_API_SECRET)
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

// =============================================================================
// TE SANDBOX API CLIENT (for --live mode)
// =============================================================================

const TE_BASE_URL = process.env.TE_API_BASE_URL || "https://api.ticketevolution.com";
const TE_VERSION = "/v9";

function buildTeListingsRequest(eventId) {
  const params = {
    event_id: String(eventId),
    type: "event",
  };
  const sortedKeys = Object.keys(params).sort();
  const queryString =
    sortedKeys.length > 0
      ? "?" +
        sortedKeys
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "?";
  const baseUrlObj = new URL(TE_BASE_URL);
  const hostname = baseUrlObj.hostname;
  const versionPrefix = baseUrlObj.pathname.replace(/\/$/, "") || TE_VERSION;
  const path = `${versionPrefix}/listings`;
  const stringToSign = `GET ${hostname}${path}${queryString}`;
  return { params, sortedKeys, queryString, path, hostname, stringToSign };
}

function signTeRequest(stringToSign, secret) {
  return crypto.createHmac("sha256", secret).update(stringToSign).digest("base64");
}

async function fetchTeListings(eventId, token, secret) {
  const { params, stringToSign } = buildTeListingsRequest(eventId);
  const signature = signTeRequest(stringToSign, secret);

  const baseUrlObj = new URL(TE_BASE_URL);
  const versionPrefix = baseUrlObj.pathname.replace(/\/$/, "") || TE_VERSION;
  const url = `${baseUrlObj.origin}${versionPrefix}/listings?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": token,
      "X-Signature": signature,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TE API ${res.status}: ${text}`);
  }
  return res.json();
}

// (Mock listings removed to focus on live data)

// =============================================================================
// HURLY POLLER LOGIC (mirrors supabase/functions/_shared/utils.ts)
// =============================================================================

const BAD_PHRASES = [
  "will be rejected",
  "accepted but not fulfilled",
  "will be accepted but not fulfilled",
  "will remain pending",
  "not fulfilled",
];

function isBuyableListing(listing) {
  const notes = String(listing.public_notes ?? listing.notes ?? "").toLowerCase();
  return !BAD_PHRASES.some((phrase) => notes.includes(phrase));
}

function aggregatePrices(listings, ownedOnly = false) {
  if (!listings || listings.length === 0) {
    return null;
  }

  const eligibleListings = listings.filter((listing) => {
    if (listing.type !== "event") return false;
    if (!isBuyableListing(listing)) return false;

    // Filter by ownership if requested
    if (ownedOnly && listing.owned !== true) return false;

    const rawPrice = listing.retail_price;
    const price = typeof rawPrice === "string" ? parseFloat(rawPrice) : rawPrice;
    const hasValidPrice =
      typeof price === "number" && !isNaN(price) && price > 0 && price < 100_000;

    const qty = listing.available_quantity;
    const hasValidQuantity = typeof qty === "number" && qty >= 2 && qty < 10_000;

    const splits = listing.splits ?? [];
    const canPurchaseTwo = Array.isArray(splits) && splits.includes(2);

    return hasValidPrice && hasValidQuantity && canPurchaseTwo;
  });

  if (eligibleListings.length === 0) return null;

  const prices = eligibleListings
    .map((l) => (typeof l.retail_price === "string" ? parseFloat(l.retail_price) : l.retail_price))
    .filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

  if (prices.length === 0) return null;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;

  return {
    min_price: parseFloat(minPrice.toFixed(2)),
    avg_price: parseFloat(avgPrice.toFixed(2)),
    max_price: parseFloat(maxPrice.toFixed(2)),
    listing_count: eligibleListings.length,
    eligibleListings,
  };
}

// =============================================================================
// DEMO RUN
// =============================================================================

// Handle CLI arguments
const ownedOnly = process.argv.includes("--owned-only");
const eventIdArg = process.argv.find((a) => !a.startsWith("-") && !isNaN(parseInt(a, 10)) && a.match(/^\d+$/));
const EVENT_ID = eventIdArg ? parseInt(eventIdArg, 10) : null;

async function runDemo() {
  if (!EVENT_ID) {
    console.error("ERROR: No Event ID provided.");
    console.error("Usage: node demo-poller-logic.js <event_id> [--owned-only]");
    process.exit(1);
  }

  const token = process.env.TE_API_TOKEN;
  const secret = process.env.TE_API_SECRET;

  if (!token || !secret) {
    console.error("ERROR: TE_API_TOKEN and TE_API_SECRET are required in .env");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  HOURLY POLLER DEMO – EVENT ${EVENT_ID} ${ownedOnly ? "(OWNED ONLY)" : ""}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const response = await fetchTeListings(EVENT_ID, token, secret);
  const listings = response.ticket_groups ?? response.listings ?? [];
  console.log(`  Fetched ${listings.length} total listings from TE API.`);

  const result = aggregatePrices(listings, ownedOnly);

  if (!result) {
    console.log("  No eligible listings found.\n");
    return;
  }

  console.log(`  Eligible listings:  ${result.listing_count}`);
  console.log("");
  console.log("  Aggregates → event_price_hourly:");
  console.log("  ┌─────────────────┬──────────────┐");
  console.log(`  │ min_price       │ $${result.min_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ avg_price       │ $${result.avg_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ max_price       │ $${result.max_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ listing_count   │ ${String(result.listing_count).padStart(11)} │`);
  console.log("  └─────────────────┴──────────────┘");
  console.log("\n  (Eligible = type=event, valid price, qty≥2, splits∋2, buyable notes)\n");
}

runDemo().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
