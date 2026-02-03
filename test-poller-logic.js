/**
 * Clean Test Script for Ticket Evolution API
 * Verifies the exact logic used in the hourly-poller
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

// Config (from .env)
const API_TOKEN = process.env.TE_API_TOKEN;
const API_SECRET = process.env.TE_API_SECRET;
const BASE_URL = `${
  process.env.TE_API_BASE_URL || "https://api.sandbox.ticketevolution.com"
}/v9`;
const TEST_EVENT_ID = process.env.TE_EVENT_ID || "2795400"; // "Test Event (Test Purchases Only)"

if (!API_TOKEN || !API_SECRET) {
  console.error("Missing TE_API_TOKEN or TE_API_SECRET in .env");
  process.exit(1);
}

// 1. Signature Generation (Matches te-api.ts)
function generateSignature(method, path, params = {}) {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = {};
  sortedKeys.forEach((key) => (sortedParams[key] = params[key]));

  // Construct query string (Always starts with ?)
  const queryString =
    sortedKeys.length > 0
      ? "?" + new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
      : "?";

  // Extract hostname and clean path
  const url = new URL(BASE_URL);
  const hostname = url.hostname;
  const versionPrefix = url.pathname.replace(/\/$/, ""); // e.g. /v9
  const fullPath = `${versionPrefix}${
    path.startsWith("/") ? path : "/" + path
  }`;

  // Sign: METHOD hostname path?query
  const stringToSign = `${method} ${hostname}${fullPath}${queryString}`;
  console.log(`📝 Signing: "${stringToSign}"`);

  const hmac = crypto.createHmac("sha256", API_SECRET);
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

// 2. Request Helper (Matches TicketEvolutionClient.get)
function makeRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const signature = generateSignature("GET", endpoint, params);

    // Construct Request URL
    const requestUrl = new URL(`${BASE_URL}${endpoint}`);
    Object.keys(params).forEach((key) =>
      requestUrl.searchParams.append(key, params[key])
    );

    console.log(`📡 Requesting: ${requestUrl.toString()}`);

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
            console.error(`❌ Error ${res.statusCode}: ${data}`);
            reject(new Error(`API Error ${res.statusCode}`));
          }
        });
      })
      .on("error", reject);
  });
}

// 3. Main Test Function
async function testPollerLogic() {
  console.log(
    "🧪 Testing Poller Logic with Sandbox Event " + TEST_EVENT_ID + "...\n"
  );

  try {
    // Correct Endpoint: /listings?event_id=...
    const response = await makeRequest("/listings", {
      event_id: TEST_EVENT_ID,
      type: "event",
    });

    // Handle response keys (ticket_groups or listings)
    const listings = response.ticket_groups || response.listings || [];

    console.log(`\n✅ Success! Found ${listings.length} listings.`);

    if (listings.length > 0) {
      const l = listings[0];
      console.log(
        `   Sample: Retail $${l.retail_price}, Available Qty: ${l.available_quantity}, Section: ${l.section}`
      );

      // Calculate Aggregates (Mirror utils.aggregatePrices)
      const ticketListings = listings.filter((l) => {
        if (l.type !== "event") {
          return false;
        }

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

        return hasValidPrice && hasValidQuantity;
      });

      if (ticketListings.length === 0) {
        console.log("\n⚠️  No valid ticket listings after filtering.");
        return;
      }

      const prices = ticketListings
        .map((l) => {
          const val = l.retail_price;
          return typeof val === "string" ? parseFloat(val) : val;
        })
        .filter((p) => typeof p === "number" && !isNaN(p) && p > 0);

      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

      console.log(`\n📊 Poller Aggregates:`);
      console.log(`   Min: $${min.toFixed(2)}`);
      console.log(`   Avg: $${avg.toFixed(2)}`);
      console.log(`   Max: $${max.toFixed(2)}`);
      console.log(`   Count: ${ticketListings.length}`);
    } else {
      console.log("⚠️  No listings array found in response (or empty).");
    }
  } catch (error) {
    console.error("❌ Test Failed:", error.message);
  }
}

testPollerLogic();
