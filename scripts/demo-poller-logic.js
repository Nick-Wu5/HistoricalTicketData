#!/usr/bin/env node
/**
 * Demo script: Hourly Poller logic
 *
 * Mimics the hourly poller's flow for boss demos:
 *   1. Fetch listings from TE sandbox API
 *   2. Filter to eligible (type=event, valid price, qty>=1, OLT buyable notes)
 *   3. Compute min/avg/max → event_price_hourly
 *
 * FILTER PHILOSOPHY: General market pricing
 * Includes all purchasable event listings to reflect the overall market price,
 * not just listings that allow specific purchase quantities (e.g., pairs).
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

const TE_BASE_URL =
  process.env.TE_API_BASE_URL || "https://api.ticketevolution.com";
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
          .map(
            (k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`,
          )
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
  return crypto
    .createHmac("sha256", secret)
    .update(stringToSign)
    .digest("base64");
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
  const notes = String(
    listing.public_notes ?? listing.notes ?? "",
  ).toLowerCase();
  return !BAD_PHRASES.some((phrase) => notes.includes(phrase));
}

/**
 * Calculate trimmed mean - removes top and bottom percentage before averaging.
 * This reduces the impact of outlier listings (scalper premiums, data errors).
 * @param {number[]} sortedPrices - Array of prices, must be sorted ascending
 * @param {number} trimPercent - Percentage to trim from each end (default 0.1 = 10%)
 * @returns {number} Trimmed mean value
 */
function calculateTrimmedMean(sortedPrices, trimPercent = 0.1) {
  const len = sortedPrices.length;

  // Need at least 3 items to trim meaningfully
  if (len < 3) {
    return sortedPrices.reduce((sum, p) => sum + p, 0) / len;
  }

  const trimCount = Math.floor(len * trimPercent);

  // If trim would remove all items, fall back to simple mean
  if (trimCount * 2 >= len) {
    return sortedPrices.reduce((sum, p) => sum + p, 0) / len;
  }

  const trimmed = sortedPrices.slice(trimCount, len - trimCount);
  return trimmed.reduce((sum, p) => sum + p, 0) / trimmed.length;
}

/**
 * Diagnostic counters track where listings are filtered out so we can
 * understand why an event temporarily had no eligible listings.
 */

/**
 * Aggregate prices with diagnostic counters for debugging.
 * Tracks listing counts at each filter stage.
 * @param {Array} listings - Raw listings from TE API
 * @param {boolean} ownedOnly - Filter to owned listings only
 * @returns {{ aggregates: Object|null, diagnostics: Object, skip_reason: string|null }}
 */
function aggregatePricesWithDiagnostics(listings, ownedOnly = false) {
  // Initialize diagnostic counters
  const diagnostics = {
    raw_listing_count: 0,
    event_listing_count: 0,
    quantity_match_count: 0,
    buyable_listing_count: 0,
  };

  // Stage 0: Raw listing count
  diagnostics.raw_listing_count = listings?.length ?? 0;

  if (!listings || listings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_te_listings",
    };
  }

  // Stage 1: Filter to event-type listings with valid prices
  const eventListings = listings.filter((listing) => {
    if (listing.type !== "event") return false;
    if (ownedOnly && listing.owned !== true) return false;

    const rawPrice = listing.retail_price;
    const price =
      typeof rawPrice === "string" ? parseFloat(rawPrice) : rawPrice;
    const hasValidPrice =
      typeof price === "number" &&
      !isNaN(price) &&
      price > 0 &&
      price < 100_000;

    return hasValidPrice;
  });
  diagnostics.event_listing_count = eventListings.length;

  if (eventListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_event_listings",
    };
  }

  // Stage 2: Filter by quantity eligibility
  // General market pricing: include any listing with at least 1 available ticket.
  // We do NOT require qty >= 2 or splits.includes(2) since we want to reflect
  // the overall market, not just the "2-ticket purchase" subset.
  const quantityListings = eventListings.filter((listing) => {
    const qty = listing.available_quantity;
    // Require at least 1 ticket, cap at 10k to filter obvious data errors
    return typeof qty === "number" && qty >= 1 && qty < 10_000;
  });
  diagnostics.quantity_match_count = quantityListings.length;

  if (quantityListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_valid_quantity",
    };
  }

  // Stage 3: Filter by buyable status (exclude rejected/pending notes)
  const buyableListings = quantityListings.filter(isBuyableListing);
  diagnostics.buyable_listing_count = buyableListings.length;

  if (buyableListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_buyable_listings",
    };
  }

  // Stage 4: Extract and validate prices
  const prices = buyableListings
    .map((l) =>
      typeof l.retail_price === "string"
        ? parseFloat(l.retail_price)
        : l.retail_price,
    )
    .filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

  if (prices.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "unknown",
    };
  }

  // Stage 5: Compute aggregates
  const sortedPrices = prices.slice().sort((a, b) => a - b);
  const minPrice = sortedPrices[0];
  const maxPrice = sortedPrices[sortedPrices.length - 1];
  const avgPrice = calculateTrimmedMean(sortedPrices, 0.1);

  return {
    aggregates: {
      min_price: parseFloat(minPrice.toFixed(2)),
      avg_price: parseFloat(avgPrice.toFixed(2)),
      max_price: parseFloat(maxPrice.toFixed(2)),
      listing_count: buyableListings.length,
      eligibleListings: buyableListings,
    },
    diagnostics,
    skip_reason: null,
  };
}

/**
 * Legacy wrapper - for backwards compatibility
 */
function aggregatePrices(listings, ownedOnly = false) {
  const result = aggregatePricesWithDiagnostics(listings, ownedOnly);
  return result.aggregates;
}

// =============================================================================
// DEMO RUN
// =============================================================================

// Handle CLI arguments
const ownedOnly = process.argv.includes("--owned-only");
const eventIdArg = process.argv.find(
  (a) => !a.startsWith("-") && !isNaN(parseInt(a, 10)) && a.match(/^\d+$/),
);
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

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  HOURLY POLLER DEMO – EVENT ${EVENT_ID} ${ownedOnly ? "(OWNED ONLY)" : ""}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const response = await fetchTeListings(EVENT_ID, token, secret);
  const listings = response.ticket_groups ?? response.listings ?? [];
  console.log(`  Fetched ${listings.length} total listings from TE API.`);

  // Use diagnostic version to show filter pipeline
  const { aggregates, diagnostics, skip_reason } =
    aggregatePricesWithDiagnostics(listings, ownedOnly);

  // Display diagnostic counters (filter pipeline)
  console.log("");
  console.log("  Filter Pipeline Diagnostics:");
  console.log("  ┌─────────────────────────┬─────────┐");
  console.log(
    `  │ raw_listing_count       │ ${String(diagnostics.raw_listing_count).padStart(7)} │`,
  );
  console.log(
    `  │ event_listing_count     │ ${String(diagnostics.event_listing_count).padStart(7)} │`,
  );
  console.log(
    `  │ quantity_match_count    │ ${String(diagnostics.quantity_match_count).padStart(7)} │`,
  );
  console.log(
    `  │ buyable_listing_count   │ ${String(diagnostics.buyable_listing_count).padStart(7)} │`,
  );
  console.log("  └─────────────────────────┴─────────┘");

  if (!aggregates) {
    console.log("");
    console.log(`  ⚠️  Skip reason: ${skip_reason}`);
    console.log("  No eligible listings found.\n");
    return;
  }

  console.log("");
  console.log("  Aggregates → event_price_hourly:");
  console.log("  ┌─────────────────┬──────────────┐");
  console.log(
    `  │ min_price       │ $${aggregates.min_price.toFixed(2).padStart(10)} │`,
  );
  console.log(
    `  │ avg_price       │ $${aggregates.avg_price.toFixed(2).padStart(10)} │`,
  );
  console.log(
    `  │ max_price       │ $${aggregates.max_price.toFixed(2).padStart(10)} │`,
  );
  console.log(
    `  │ listing_count   │ ${String(aggregates.listing_count).padStart(11)} │`,
  );
  console.log("  └─────────────────┴──────────────┘");
  console.log(
    "\n  (Eligible = type=event, valid price, qty≥1, buyable notes)\n",
  );
}

runDemo().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
