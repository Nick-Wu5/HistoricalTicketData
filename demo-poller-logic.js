#!/usr/bin/env node
/**
 * Demo script: Hourly Poller logic
 *
 * Mimics the hourly poller's flow for boss demos:
 *   1. Fetch listings (mock data OR live TE sandbox API with --live)
 *   2. Filter to eligible (type=event, valid price/qty/splits, OLT buyable notes)
 *   3. Compute min/avg/max → event_price_hourly
 *
 * Run:
 *   node demo-poller-logic.js              # Mock data (no API keys)
 *   node demo-poller-logic.js --live      # Live TE sandbox (loads TE_API_TOKEN, TE_API_SECRET from .env)
 *   node demo-poller-logic.js --live 982605  # Live with specific event_id
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

const TE_SANDBOX_BASE = "https://api.sandbox.ticketevolution.com/v9";

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
  const path = "/v9/listings";
  const hostname = "api.sandbox.ticketevolution.com";
  const stringToSign = `GET ${hostname}${path}${queryString}`;
  return { params, sortedKeys, queryString, path, hostname, stringToSign };
}

function signTeRequest(stringToSign, secret) {
  return crypto.createHmac("sha256", secret).update(stringToSign).digest("base64");
}

async function fetchTeListings(eventId, token, secret) {
  const { params, stringToSign } = buildTeListingsRequest(eventId);
  const signature = signTeRequest(stringToSign, secret);

  const url = `${TE_SANDBOX_BASE}/listings?${new URLSearchParams(params)}`;
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

// Normalize TE API listing to our format (TE uses 'quantity', we use 'available_quantity')
function normalizeListing(l, index) {
  const raw = l ?? {};
  return {
    id: raw.id ?? `L${index + 1}`,
    retail_price: raw.retail_price,
    available_quantity: raw.available_quantity ?? raw.quantity ?? 0,
    splits: raw.splits ?? [],
    type: raw.type ?? "event",
    section: raw.section ?? "",
    public_notes: raw.public_notes,
    notes: raw.notes,
  };
}

// =============================================================================
// MOCK TE API LISTINGS (simulates response.ticket_groups / response.listings)
// =============================================================================

const MOCK_LISTINGS = [
  {
    id: "L001",
    retail_price: 49,
    available_quantity: 4,
    splits: [2, 4],
    type: "event",
    section: "101",
    notes: "Section 101, Row 12",
  },
  {
    id: "L002",
    retail_price: 35,
    available_quantity: 2,
    splits: [2],
    type: "event",
    section: "205",
    public_notes: "Will be rejected - broker no longer has these",
  },
  {
    id: "L003",
    retail_price: 89,
    available_quantity: 6,
    splits: [2, 4, 6],
    type: "event",
    section: "Lower bowl",
    notes: "",
  },
  {
    id: "L004",
    retail_price: 29,
    available_quantity: 2,
    splits: [2],
    type: "event",
    section: "Upper",
    public_notes: "Accepted but not fulfilled - waiting on transfer",
  },
  {
    id: "L005",
    retail_price: 125,
    available_quantity: 4,
    splits: [2, 4],
    type: "event",
    section: "Floor",
    notes: "VIP access",
  },
  {
    id: "L006",
    retail_price: 22,
    available_quantity: 2,
    splits: [2],
    type: "event",
    section: "301",
    public_notes: "Will remain pending until event date",
  },
  {
    id: "L007",
    retail_price: 45,
    available_quantity: 3,
    splits: [2],
    type: "event",
    section: "102",
    notes: null,
  },
  {
    id: "L008",
    retail_price: 150,
    available_quantity: 1,
    splits: [1],
    type: "event",
    section: "Suite",
    notes: "Single ticket only",
  },
  {
    id: "L009",
    retail_price: "invalid",
    available_quantity: 2,
    splits: [2],
    type: "event",
    section: "999",
    notes: "Bad price data",
  },
];

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

function aggregatePrices(listings) {
  if (!listings || listings.length === 0) {
    return null;
  }

  const eligibleListings = listings.filter((listing) => {
    if (listing.type !== "event") return false;
    if (!isBuyableListing(listing)) return false;

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

const useLive = process.argv.includes("--live");
const eventIdArg = process.argv.find((a, i) => process.argv[i - 1] === "--live" && !a.startsWith("-"));
const EVENT_ID = eventIdArg ? parseInt(eventIdArg, 10) : 982605;

function fmt(listing) {
  const notes = listing.public_notes ?? listing.notes ?? "(none)";
  const buyable = isBuyableListing(listing) ? "✓" : "✗";
  const qty = listing.available_quantity ?? listing.quantity ?? "?";
  return `  [${listing.id}] $${listing.retail_price} qty=${qty} ${buyable} buyable  notes: ${notes}`;
}

async function runDemo() {
  let listings = MOCK_LISTINGS;

  if (useLive) {
    const token = process.env.TE_API_TOKEN;
    const secret = process.env.TE_API_SECRET;
    if (!token || !secret) {
      console.error("ERROR: --live requires TE_API_TOKEN and TE_API_SECRET.");
      console.error("  Add to .env in project root (same as hourly-poller), or:");
      console.error("  export TE_API_TOKEN=your_token");
      console.error("  export TE_API_SECRET=your_secret");
      process.exit(1);
    }

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  HOURLY POLLER DEMO – LIVE TE SANDBOX API");
    console.log("═══════════════════════════════════════════════════════════════\n");

    console.log(`  Event ID: ${EVENT_ID} (sandbox test event 982605 by default)\n`);

    const build = buildTeListingsRequest(EVENT_ID);
    console.log("STEP 0: API query building (matches hourly-poller / TE client)\n");
    console.log("  Endpoint:   GET /v9/listings");
    console.log("  Params:    ", JSON.stringify(build.params));
    console.log("  Full URL: ", `${TE_SANDBOX_BASE}/listings?event_id=${EVENT_ID}&type=event`);
    console.log("  String to sign (HMAC-SHA256):");
    console.log(`    "${build.stringToSign}"`);
    console.log("");

    console.log("  Fetching from TE sandbox API...\n");
    const response = await fetchTeListings(EVENT_ID, token, secret);
    const raw = response.ticket_groups ?? response.listings ?? [];
    listings = raw.map(normalizeListing);
    console.log(`  Received ${listings.length} listings from TE API.\n`);
  } else {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  HOURLY POLLER DEMO – Mock data (use --live for real API)");
    console.log("═══════════════════════════════════════════════════════════════\n");
  }

  console.log("STEP 1: Raw listings from TE API (/listings?event_id=...&type=event)\n");
  listings.forEach((l) => console.log(fmt(l)));

  console.log("\nSTEP 2: Notes filter (OLT buyable – excludes rejected/not-fulfilled/pending)\n");
  const buyable = listings.filter((l) => isBuyableListing(l));
  const excluded = listings.filter((l) => !isBuyableListing(l));

  if (excluded.length > 0) {
    console.log("  EXCLUDED by notes (not shown as 'starting at'):");
    excluded.forEach((l) => console.log(`    [${l.id}] notes: "${l.public_notes || l.notes || ""}"`));
  } else {
    console.log("  (No listings excluded by notes in this dataset)");
  }

  console.log("\n  PASS notes filter:");
  buyable.forEach((l) => console.log(`    [${l.id}] $${l.retail_price} – ${l.section || "(n/a)"}`));

  console.log("\nSTEP 3: Full eligibility (type=event + valid price + qty≥2 + splits∋2 + buyable notes)\n");
  const result = aggregatePrices(listings);

  if (!result) {
    console.log("  No eligible listings → event_price_hourly: min/avg/max = NULL\n");
    return;
  }

  console.log("  Eligible listings used for aggregates:");
  result.eligibleListings.forEach((l) =>
    console.log(`    [${l.id}] $${l.retail_price} – ${l.section || "(n/a)"}`)
  );

  console.log("\nSTEP 4: Aggregates written to event_price_hourly\n");
  console.log("  ┌─────────────────┬──────────────┐");
  console.log(`  │ min_price       │ $${result.min_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ avg_price       │ $${result.avg_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ max_price       │ $${result.max_price.toFixed(2).padStart(10)} │`);
  console.log(`  │ listing_count   │ ${String(result.listing_count).padStart(11)} │`);
  console.log("  └─────────────────┴──────────────┘");

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Takeaway: Min price comes ONLY from buyable listings.");
  console.log("  Listings with 'will be rejected', 'not fulfilled', etc. are excluded.");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

runDemo().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
