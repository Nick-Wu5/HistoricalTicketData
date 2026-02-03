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
// Test Examples
// ============================================
async function runTests() {
  console.log("===========================================");
  console.log("Ticket Evolution API Test");
  console.log("===========================================\n");

  // Check if credentials are set
  if (!API_TOKEN || !API_SECRET) {
    console.error("ERROR: Please set TE_API_TOKEN and TE_API_SECRET in .env!");
    process.exit(1);
  }

  try {
    // Test 1: Simple request with no parameters
    console.log("TEST 1: Get categories (no parameters)");
    console.log("---------------------------------------");
    const categories = await makeRequest("/categories");
    console.log(
      "✓ Success! Received",
      categories.categories?.length || 0,
      "categories"
    );
    console.log("Sample category:", categories.categories?.[0]?.name);
    console.log("\n");

    // Test 2: Request with query parameters (sorted alphabetically)
    console.log("TEST 2: Get brokerages with pagination");
    console.log("---------------------------------------");
    const brokerages = await makeRequest("/brokerages", {
      per_page: 1,
      page: 1,
    });
    console.log(
      "✓ Success! Received",
      brokerages.brokerages?.length || 0,
      "brokerages"
    );
    console.log("Sample brokerage:", brokerages.brokerages?.[0]?.name);
    console.log("\n");

    // Test 3: Get a specific event (you can replace with a real event ID)
    console.log("TEST 3: Search events");
    console.log("---------------------------------------");
    const events = await makeRequest("/events", {
      per_page: 5,
    });
    console.log("✓ Success! Received", events.events?.length || 0, "events");
    if (events.events?.[0]) {
      console.log("Sample event:", events.events[0].name);
      console.log("Event ID:", events.events[0].id);
    }
    console.log("\n");

    console.log("===========================================");
    console.log("All tests passed! ✓");
    console.log("===========================================");
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

// Run the tests
runTests();
