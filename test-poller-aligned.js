/**
 * Poller-aligned test script (Node.js)
 * Mirrors the hourly poller aggregation logic to compare raw vs filtered stats.
 */

const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  contents.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.join(__dirname, ".env"));

const API_TOKEN = process.env.TE_API_TOKEN;
const API_SECRET = process.env.TE_API_SECRET;
const API_BASE_URL =
  process.env.TE_API_BASE_URL || "https://api.sandbox.ticketevolution.com";
const EVENT_ID = process.env.TE_EVENT_ID || process.argv[2] || "2795400";
const BASE_URL = `${API_BASE_URL}/v9`;

if (!API_TOKEN || !API_SECRET) {
  console.error("Missing TE_API_TOKEN or TE_API_SECRET in .env");
  process.exit(1);
}

function generateSignature(method, path, params = {}) {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = {};
  sortedKeys.forEach((key) => (sortedParams[key] = params[key]));

  const queryString =
    sortedKeys.length > 0
      ? "?" + new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
      : "?";

  const url = new URL(BASE_URL);
  const hostname = url.hostname;
  const versionPrefix = url.pathname.replace(/\/$/, "");
  const fullPath = `${versionPrefix}${
    path.startsWith("/") ? path : "/" + path
  }`;

  const stringToSign = `${method} ${hostname}${fullPath}${queryString}`;

  const hmac = crypto.createHmac("sha256", API_SECRET);
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

function makeRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const signature = generateSignature("GET", endpoint, params);
    const requestUrl = new URL(`${BASE_URL}${endpoint}`);
    Object.keys(params).forEach((key) =>
      requestUrl.searchParams.append(key, params[key])
    );

    const options = {
      headers: {
        Accept: "application/json",
        "X-Token": API_TOKEN,
        "X-Signature": signature,
      },
    };

    https
      .get(requestUrl.toString(), options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

// Exact aggregation logic from supabase/functions/_shared/utils.ts
function aggregatePrices(listings) {
  if (!listings || listings.length === 0) {
    return null;
  }

  const ticketListings = listings.filter((l) => {
    if (l.type !== "event") {
      return false;
    }

    const isTicket =
      l.format === "ticket" ||
      (!l.notes?.toLowerCase().includes("parking") &&
        !l.notes?.toLowerCase().includes("tailgate"));

    const rawPrice = l.retail_price;
    const price =
      typeof rawPrice === "string" ? parseFloat(rawPrice) : rawPrice;
    if (typeof price !== "number" || isNaN(price) || price <= 0) {
      return false;
    }

    const hasValidPrice = price > 0 && price < 100000;
    const availableQuantity = l.available_quantity;
    const hasValidQuantity =
      typeof availableQuantity === "number" &&
      availableQuantity >= 2 &&
      availableQuantity < 10000;

    return isTicket && hasValidPrice && hasValidQuantity;
  });

  if (ticketListings.length === 0) {
    return null;
  }

  const prices = ticketListings
    .map((l) => {
      const val = l.retail_price;
      return typeof val === "string" ? parseFloat(val) : val;
    })
    .filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  return {
    min_price: parseFloat(min.toFixed(2)),
    avg_price: parseFloat(avg.toFixed(2)),
    max_price: parseFloat(max.toFixed(2)),
    listing_count: ticketListings.length,
    price_basis: "ticket",
  };
}

function countInvalidAvailableQuantity(listings) {
  return listings.filter((l) => {
    const availableQuantity = l.available_quantity;
    return !(
      typeof availableQuantity === "number" &&
      availableQuantity >= 2 &&
      availableQuantity < 10000
    );
  }).length;
}

async function run() {
  console.log(`🧪 Poller-aligned test for event ${EVENT_ID}...\n`);

  const response = await makeRequest("/listings", {
    event_id: EVENT_ID,
    type: "event",
  });
  const listings = response.ticket_groups || response.listings || [];

  console.log(`✅ Listings returned: ${listings.length}`);
  console.log(
    `🚫 Dropped by available_quantity filter: ${countInvalidAvailableQuantity(
      listings
    )}`
  );

  const rawPrices = listings
    .map((l) => l.retail_price)
    .map((p) => (typeof p === "string" ? parseFloat(p) : p))
    .filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

  if (rawPrices.length > 0) {
    const rawMin = Math.min(...rawPrices);
    const rawMax = Math.max(...rawPrices);
    const rawAvg = rawPrices.reduce((a, b) => a + b, 0) / rawPrices.length;
    console.log("\n📈 Raw price stats (no filtering):");
    console.log(`   Min: $${rawMin.toFixed(2)}`);
    console.log(`   Avg: $${rawAvg.toFixed(2)}`);
    console.log(`   Max: $${rawMax.toFixed(2)}`);
    console.log(`   Count: ${rawPrices.length}`);
  } else {
    console.log("\n⚠️  No valid raw prices found.");
  }

  const aggregates = aggregatePrices(listings);
  if (!aggregates) {
    console.log(
      "\n⚠️  aggregatePrices returned null (no valid ticket listings)."
    );
    return;
  }

  console.log("\n📊 Poller aggregates (same logic as hourly poller):");
  console.log(`   Min: $${aggregates.min_price.toFixed(2)}`);
  console.log(`   Avg: $${aggregates.avg_price.toFixed(2)}`);
  console.log(`   Max: $${aggregates.max_price.toFixed(2)}`);
  console.log(`   Listing count: ${aggregates.listing_count}`);
}

run().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
