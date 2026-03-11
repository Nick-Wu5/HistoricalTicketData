#!/usr/bin/env node
/**
 * Diagnostic script: audit aggregation + outlier behavior for a single TE event.
 *
 * This script intentionally mirrors the production hourly poller filters and math:
 * - type=event
 * - retail_price > 0 and < 100k
 * - available_quantity >= 1 and < 10k
 * - excludes non-buyable notes via bad phrases
 * - AVG = 10% trimmed mean
 * - MIN/MAX = raw min/max of eligible set (no trimming)
 *
 * Usage:
 *   node scripts/diagnose-event-aggregation.js <te_event_id>
 */
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const TE_BASE_URL =
  process.env.TE_API_BASE_URL || "https://api.ticketevolution.com";
const TE_VERSION = "/v9";

const BAD_PHRASES = [
  "will be rejected",
  "accepted but not fulfilled",
  "will be accepted but not fulfilled",
  "will remain pending",
  "not fulfilled",
];

// Keep this intentionally conservative to avoid excluding legitimate inventory.
// Only match very explicit bundle/premium indicators.
const PREMIUM_SIGNALS = [
  "all session",
  "all-session",
  "session pass",
  "package",
  "suite",
  "hospitality",
];

function signTeRequest(stringToSign, secret) {
  return crypto.createHmac("sha256", secret).update(stringToSign).digest("base64");
}

function buildTeListingsRequest(eventId) {
  const params = { event_id: String(eventId), type: "event" };
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
  const requestPath = `${versionPrefix}/listings`;
  const stringToSign = `GET ${hostname}${requestPath}${queryString}`;
  return { params, stringToSign, versionPrefix, baseUrlObj };
}

async function fetchTeListings(eventId, token, secret) {
  const { params, stringToSign, versionPrefix, baseUrlObj } =
    buildTeListingsRequest(eventId);
  const signature = signTeRequest(stringToSign, secret);
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

function isBuyableListing(listing) {
  const notes = String(listing.public_notes ?? listing.notes ?? "").toLowerCase();
  return !BAD_PHRASES.some((phrase) => notes.includes(phrase));
}

function toNumber(x) {
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const v = parseFloat(x);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function calculateTrimmedMean(sortedPrices, trimPercent = 0.1) {
  const len = sortedPrices.length;
  if (len === 0) return null;
  if (len < 3) return sortedPrices.reduce((s, p) => s + p, 0) / len;
  const trimCount = Math.floor(len * trimPercent);
  if (trimCount * 2 >= len) return sortedPrices.reduce((s, p) => s + p, 0) / len;
  const trimmed = sortedPrices.slice(trimCount, len - trimCount);
  return trimmed.reduce((s, p) => s + p, 0) / trimmed.length;
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base];
  const b = sorted[base + 1] ?? a;
  return a + rest * (b - a);
}

function normalizeText(x) {
  return String(x ?? "").toLowerCase();
}

function hasPremiumSignals(listing) {
  const notes = normalizeText(listing?.public_notes ?? listing?.notes);
  const row = normalizeText(
    listing?.row ??
      listing?.row_name ??
      listing?.seating_row ??
      listing?.ticket_group?.row ??
      listing?.ticket_group?.row_name,
  );
  const section = normalizeText(
    listing?.section ??
      listing?.section_name ??
      listing?.seating_section ??
      listing?.ticket_group?.section ??
      listing?.ticket_group?.section_name,
  );

  const haystack = `${notes} ${row} ${section}`.trim();
  if (!haystack) return false;

  if (row === "package") return true;
  return PREMIUM_SIGNALS.some((s) => haystack.includes(s));
}

function fmtMoney(x) {
  if (x == null) return "null";
  return `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pickListingDebugFields(listing) {
  const price = toNumber(listing.retail_price);
  const qty = listing.available_quantity;
  const notes = String(listing.public_notes ?? listing.notes ?? "");
  const section =
    listing.section ??
    listing.section_name ??
    listing.seating_section ??
    listing.ticket_group?.section ??
    listing.ticket_group?.section_name ??
    null;
  const row =
    listing.row ??
    listing.row_name ??
    listing.seating_row ??
    listing.ticket_group?.row ??
    listing.ticket_group?.row_name ??
    null;
  const category =
    listing.ticket_type ??
    listing.seating_type ??
    listing.product_type ??
    listing.type ??
    null;

  return {
    id: listing.id ?? listing.listing_id ?? null,
    retail_price: price,
    available_quantity: qty,
    section,
    row,
    category,
    notes: notes ? notes.slice(0, 120) : "",
    owned: listing.owned ?? null,
  };
}

function computeEligibility(listings) {
  const raw = listings ?? [];

  const stage1 = raw.filter((l) => {
    if (l?.type !== "event") return false;
    const price = toNumber(l?.retail_price);
    return typeof price === "number" && price > 0 && price < 100_000;
  });

  const stage2 = stage1.filter((l) => {
    const qty = l?.available_quantity;
    return typeof qty === "number" && qty >= 1 && qty < 10_000;
  });

  const stage3 = stage2.filter(isBuyableListing);

  const prices = stage3
    .map((l) => toNumber(l?.retail_price))
    .filter((p) => typeof p === "number" && Number.isFinite(p) && p > 0);

  const sortedPrices = prices.slice().sort((a, b) => a - b);
  const aggregates = sortedPrices.length
    ? {
        min_price: sortedPrices[0],
        max_price: sortedPrices[sortedPrices.length - 1],
        avg_price: calculateTrimmedMean(sortedPrices, 0.1),
        listing_count: stage3.length,
      }
    : null;

  return {
    diagnostics: {
      raw_listing_count: raw.length,
      event_listing_count: stage1.length,
      quantity_match_count: stage2.length,
      buyable_listing_count: stage3.length,
    },
    eligible_listings: stage3,
    sorted_prices: sortedPrices,
    aggregates,
  };
}

function computeExperimentalAggregation(eligibleListings) {
  const stageA = eligibleListings.filter((l) => !hasPremiumSignals(l));

  const pricesA = stageA
    .map((l) => toNumber(l?.retail_price))
    .filter((p) => typeof p === "number" && Number.isFinite(p) && p > 0);
  const sortedA = pricesA.slice().sort((a, b) => a - b);

  const medA = median(sortedA);
  const p05A = quantile(sortedA, 0.05);
  const p95A = quantile(sortedA, 0.95);
  const avgTrimA = calculateTrimmedMean(sortedA, 0.1);

  return {
    counts: {
      eligible_in: eligibleListings.length,
      after_premium_filter: stageA.length,
      after_iqr_price_filter: stageA.length, // kept for compatibility; no IQR now
    },
    premium_excluded_count: eligibleListings.length - stageA.length,
    premium_excluded_samples: eligibleListings
      .filter((l) => hasPremiumSignals(l))
      .map(pickListingDebugFields)
      .slice(0, 10),
    stageA: {
      sorted_prices: sortedA,
      median: medA,
      p05: p05A,
      p95: p95A,
      trimmed_mean_10: avgTrimA,
    },
    // Premium-only stats, raw min/trimmed/raw max
    premium_only_stats: {
      min_raw: sortedA[0] ?? null,
      avg_trimmed_mean_10: avgTrimA,
      max_raw: sortedA.length ? sortedA[sortedA.length - 1] : null,
    },
    // Premium-only stats, percentile display (p05 / trimmed / p95)
    premium_plus_percentiles_stats: {
      min_p05: p05A,
      avg_trimmed_mean_10: avgTrimA,
      max_p95: p95A,
    },
  };
}

async function main() {
  const eventIdArg = process.argv.find(
    (a) => !a.startsWith("-") && !isNaN(parseInt(a, 10)) && a.match(/^\d+$/),
  );
  const EVENT_ID = eventIdArg ? parseInt(eventIdArg, 10) : null;
  if (!EVENT_ID) {
    console.error("Usage: node scripts/diagnose-event-aggregation.js <te_event_id>");
    process.exit(1);
  }

  const token = process.env.TE_API_TOKEN;
  const secret = process.env.TE_API_SECRET;
  if (!token || !secret) {
    console.error("ERROR: TE_API_TOKEN and TE_API_SECRET are required in .env");
    process.exit(1);
  }

  const response = await fetchTeListings(EVENT_ID, token, secret);
  const listings = response.ticket_groups ?? response.listings ?? [];
  const { diagnostics, eligible_listings, sorted_prices, aggregates } =
    computeEligibility(listings);

  console.log(`Event ${EVENT_ID} – aggregation diagnostic`);
  console.log("");
  console.log(`Total listings fetched: ${diagnostics.raw_listing_count}`);
  console.log(`Listings after filters: ${diagnostics.buyable_listing_count}`);
  console.log("");
  console.log("Filter pipeline counts:");
  console.log(JSON.stringify(diagnostics, null, 2));

  console.log("");
  const low10 = sorted_prices.slice(0, 10);
  const high10 = sorted_prices.slice(-10);
  console.log("10 lowest eligible prices:");
  console.log(low10.map(fmtMoney).join(", "));
  console.log("");
  console.log("10 highest eligible prices:");
  console.log(high10.map(fmtMoney).join(", "));

  console.log("");
  const med = median(sorted_prices);
  const tmean10 = calculateTrimmedMean(sorted_prices, 0.1);
  const p05 = quantile(sorted_prices, 0.05);
  const p95 = quantile(sorted_prices, 0.95);
  console.log(`Median eligible price: ${fmtMoney(med)}`);
  console.log(`Trimmed mean (10%): ${fmtMoney(tmean10)}`);
  console.log(`5th percentile: ${fmtMoney(p05)}`);
  console.log(`95th percentile: ${fmtMoney(p95)}`);

  if (aggregates) {
    console.log("");
    console.log("Final widget aggregates (current logic):");
    console.log(`MIN: ${fmtMoney(aggregates.min_price)}`);
    console.log(`AVG (10% trimmed): ${fmtMoney(aggregates.avg_price)}`);
    console.log(`MAX (raw): ${fmtMoney(aggregates.max_price)}`);
  }

  const exp = computeExperimentalAggregation(eligible_listings);
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Experimental aggregation (temporary diagnostic only)");
  console.log("  A) Premium-only: raw min / 10% trimmed mean / raw max");
  console.log("  B) Premium + percentiles: MIN=p05, AVG=10% trimmed mean, MAX=p95");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Listing counts after each step:");
  console.log(JSON.stringify(exp.counts, null, 2));
  console.log("");
  console.log(`Premium-signal listings excluded: ${exp.premium_excluded_count}`);
  console.log("Premium excluded samples (first 10):");
  console.log(JSON.stringify(exp.premium_excluded_samples, null, 2));
  console.log("");
  console.log("Price samples (after premium filter):");
  console.log(
    `  bottom10: ${exp.stageA.sorted_prices.slice(0, 10).map(fmtMoney).join(", ")}`,
  );
  console.log(
    `  top10:    ${exp.stageA.sorted_prices.slice(-10).map(fmtMoney).join(", ")}`,
  );

  console.log("");
  console.log("Comparison (current vs experimental):");
  console.log(
    JSON.stringify(
      {
        current_production: {
          min_raw: aggregates?.min_price ?? null,
          avg_trimmed_mean_10: aggregates?.avg_price ?? null,
          max_raw: aggregates?.max_price ?? null,
        },
        premium_only: exp.premium_only_stats,
        premium_plus_percentiles: exp.premium_plus_percentiles_stats,
      },
      null,
      2,
    ),
  );

  // Inspect the very top listings with metadata to see what they look like.
  console.log("");
  console.log("Top 15 eligible listings (metadata sample):");
  const eligibleWithPrice = eligible_listings
    .map((l) => ({ listing: l, price: toNumber(l?.retail_price) }))
    .filter((x) => typeof x.price === "number" && Number.isFinite(x.price));
  eligibleWithPrice.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  const top = eligibleWithPrice.slice(0, 15).map((x) => pickListingDebugFields(x.listing));
  console.log(JSON.stringify(top, null, 2));

  // Also show any listings above 4x median (common robust heuristic).
  console.log("");
  if (med != null) {
    const cutoff = med * 4;
    const extreme = eligibleWithPrice
      .filter((x) => (x.price ?? 0) > cutoff)
      .slice(0, 50)
      .map((x) => pickListingDebugFields(x.listing));
    console.log(
      `Eligible listings above 4x median (${fmtMoney(cutoff)}): ${extreme.length}`,
    );
    console.log(JSON.stringify(extreme.slice(0, 20), null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

