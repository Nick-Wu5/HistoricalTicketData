#!/usr/bin/env node

/**
 * Simple test script for Ticket Evolution API
 * Tests authentication and makes a basic GET request
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

// ============================================
// CONFIGURATION - Use values from .env
// ============================================
const API_TOKEN = process.env.TE_API_TOKEN;
const API_SECRET = process.env.TE_API_SECRET;
const API_BASE_URL =
  process.env.TE_API_BASE_URL || "https://api.sandbox.ticketevolution.com";

// ============================================
// HMAC-SHA256 Signature Generator
// ============================================
function generateSignature(method, hostname, path, queryString, secret) {
  // Build the string to sign
  // Format: METHOD hostname/path?queryparams
  // IMPORTANT: Always include '?' even if no query params
  const stringToSign = `${method} ${hostname}${path}${queryString}`;

  console.log("String to sign:", stringToSign);

  // Generate HMAC-SHA256 hash
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(stringToSign);
  const signature = hmac.digest("base64");

  console.log("Generated signature:", signature);

  return signature;
}

// ============================================
// Sort query parameters alphabetically
// ============================================
function sortQueryParams(params) {
  if (!params || Object.keys(params).length === 0) {
    return "?"; // Always include '?' even with no params
  }

  const sorted = Object.keys(params)
    .sort() // Alphabetical sort
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");

  return `?${sorted}`;
}

// ============================================
// Make authenticated API request
// ============================================
function makeRequest(endpoint, queryParams = {}) {
  return new Promise((resolve, reject) => {
    const method = "GET";
    const hostname = new URL(API_BASE_URL).hostname;
    const path = `/v9${endpoint}`;
    const queryString = sortQueryParams(queryParams);

    // Generate signature
    const signature = generateSignature(
      method,
      hostname,
      path,
      queryString,
      API_SECRET
    );

    // Build request options
    const options = {
      hostname: hostname,
      path: path + queryString,
      method: method,
      headers: {
        Accept: "application/json",
        "X-Token": API_TOKEN,
        "X-Signature": signature,
      },
    };

    console.log("\n--- Request Details ---");
    console.log("URL:", `https://${hostname}${path}${queryString}`);
    console.log("Headers:", options.headers);
    console.log("----------------------\n");

    // Make the request
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log("Status Code:", res.statusCode);
        console.log("Status Message:", res.statusMessage);

        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (e) {
            reject(new Error("Failed to parse JSON response"));
          }
        } else {
          console.error("Response:", data);
          reject(
            new Error(
              `Request failed with status ${res.statusCode}: ${res.statusMessage}`
            )
          );
        }
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.end();
  });
}

// ============================================
// Fetch listings for a specific event
// ============================================
async function fetchListings() {
  console.log("===========================================");
  console.log("Ticket Evolution Listings Test");
  console.log("===========================================\n");

  const eventId = "2795400";

  // Check if credentials are set
  if (!API_TOKEN || !API_SECRET) {
    console.error("ERROR: Please set TE_API_TOKEN and TE_API_SECRET in .env!");
    process.exit(1);
  }

  try {
    console.log(`Fetching listings for event ${eventId}...`);
    const response = await makeRequest("/listings", {
      event_id: eventId,
      type: "event",
    });
    const listings = response.ticket_groups || response.listings || [];

    console.log(`\n✓ Success! Received ${listings.length} listings.\n`);

    listings.forEach((listing, index) => {
      const price = listing.retail_price;
      const availableQuantity = listing.available_quantity;
      console.log(
        `${
          index + 1
        }. Retail Price: ${price} | Available Qty: ${availableQuantity}`
      );
    });
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Verify your API_TOKEN and API_SECRET are correct");
    console.error("2. Check that your API credentials are active");
    console.error(
      "3. Use the X-Signature Generator tool mentioned in the docs"
    );
    process.exit(1);
  }
}

// Run the test
fetchListings();
