#!/usr/bin/env node
/**
 * Generates a practical TE query checklist for validating te-events-proxy.
 *
 * Output:
 * - Real sample IDs discovered from TE
 * - Ready-to-run proxy payloads for show/index modes
 *
 * Usage:
 *   node scripts/generateTeQueryChecklist.js
 *   node scripts/generateTeQueryChecklist.js --per_page=20 --page=1
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

function parseArgs(argv) {
  const getArg = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=")[1] : fallback;
  };
  const perPage = Math.max(
    1,
    Math.min(100, Number.parseInt(getArg("per_page", "10"), 10)),
  );
  const page = Math.max(1, Number.parseInt(getArg("page", "1"), 10));
  return { perPage, page };
}

function getApiPrefix(baseUrl) {
  const u = new URL(baseUrl);
  const trimmed = u.pathname.replace(/\/$/, "");
  if (!trimmed) return "/v9";
  if (trimmed.endsWith("/v9")) return trimmed;
  return `${trimmed}/v9`.replace(/\/{2,}/g, "/");
}

function buildSignedGet(baseUrl, token, secret, endpointPath, params = {}) {
  const base = new URL(baseUrl);
  const hostname = base.hostname;
  const apiPrefix = getApiPrefix(baseUrl);
  const fullPath = `${apiPrefix}${endpointPath}`.replace(/\/{2,}/g, "/");

  const sortedKeys = Object.keys(params).sort();
  const sortedParams = {};
  for (const key of sortedKeys) sortedParams[key] = String(params[key]);

  const queryString = sortedKeys.length > 0
    ? "?" + new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
    : "?";

  const stringToSign = `GET ${hostname}${fullPath}${queryString}`;
  const signature = crypto.createHmac("sha256", secret)
    .update(stringToSign)
    .digest("base64");

  const url = new URL(base.toString());
  url.pathname = fullPath;
  for (const [k, v] of Object.entries(sortedParams)) {
    url.searchParams.append(k, v);
  }

  return {
    url: url.toString(),
    headers: {
      "X-Token": token,
      "X-Signature": signature,
      "Accept": "application/json",
    },
  };
}

async function teGet(config, endpointPath, params = {}) {
  const req = buildSignedGet(
    config.teBaseUrl,
    config.teToken,
    config.teSecret,
    endpointPath,
    params,
  );
  const res = await fetch(req.url, { method: "GET", headers: req.headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TE request failed ${res.status}: ${body}`);
  }
  return res.json();
}

function pickPositiveInt(...candidates) {
  for (const c of candidates) {
    const n = Number.parseInt(String(c ?? ""), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractIdsFromEvent(event) {
  const performer = Array.isArray(event?.performers) ? event.performers[0] : null;
  const venue = event?.venue ?? null;
  const category = event?.category ?? null;

  return {
    event_id: pickPositiveInt(event?.id, event?.event_id),
    performer_id: pickPositiveInt(
      event?.performer_id,
      performer?.id,
      performer?.performer_id,
    ),
    venue_id: pickPositiveInt(
      event?.venue_id,
      venue?.id,
      venue?.venue_id,
    ),
    category_id: pickPositiveInt(
      event?.category_id,
      category?.id,
      category?.category_id,
    ),
  };
}

function printChecklist(ids) {
  console.log("\n=== Suggested Proxy Test Payloads ===\n");

  const payloads = [];
  if (ids.event_id) payloads.push({ name: "Show by event_id", body: { mode: "show", event_id: ids.event_id } });
  if (ids.performer_id) {
    payloads.push({
      name: "Index by performer_id",
      body: { mode: "index", performer_id: ids.performer_id },
    });
  }
  if (ids.venue_id) {
    payloads.push({
      name: "Index by venue_id",
      body: { mode: "index", venue_id: ids.venue_id },
    });
  }
  if (ids.category_id) {
    payloads.push({
      name: "Index by category_id",
      body: { mode: "index", category_id: ids.category_id },
    });
    payloads.push({
      name: "Index by category_id + category_tree=true",
      body: { mode: "index", category_id: ids.category_id, category_tree: true },
    });
  }

  payloads.push({
    name: "Validation check: category_tree without category_id (should fail)",
    body: { mode: "index", category_tree: true },
  });
  payloads.push({
    name: "Validation check: empty index payload (should fail)",
    body: { mode: "index" },
  });

  payloads.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name}`);
    console.log(JSON.stringify(item.body, null, 2));
    console.log("");
  });

  console.log("Tip: run each payload through your Event Manager TE query UI and confirm:");
  console.log("- network hits only /functions/v1/te-events-proxy");
  console.log("- success payloads return rows");
  console.log("- validation payloads return clean errors");
}

async function main() {
  loadEnv();
  const { perPage, page } = parseArgs(process.argv.slice(2));

  const teToken = process.env.TE_API_TOKEN;
  const teSecret = process.env.TE_API_SECRET;
  const teBaseUrl = process.env.TE_API_BASE_URL || "https://api.ticketevolution.com/v9";

  if (!teToken || !teSecret) {
    throw new Error("Missing TE_API_TOKEN or TE_API_SECRET in environment.");
  }

  const config = { teToken, teSecret, teBaseUrl };
  const index = await teGet(config, "/events", { page, per_page: perPage });
  const rows = Array.isArray(index?.events) ? index.events : [];
  if (!rows.length) throw new Error("No events returned from TE index query.");

  const ids = extractIdsFromEvent(rows[0]);

  // If first row misses any IDs, search next few rows.
  for (let i = 1; i < rows.length; i++) {
    if (ids.event_id && ids.performer_id && ids.venue_id && ids.category_id) break;
    const next = extractIdsFromEvent(rows[i]);
    if (!ids.event_id && next.event_id) ids.event_id = next.event_id;
    if (!ids.performer_id && next.performer_id) ids.performer_id = next.performer_id;
    if (!ids.venue_id && next.venue_id) ids.venue_id = next.venue_id;
    if (!ids.category_id && next.category_id) ids.category_id = next.category_id;
  }

  console.log("=== Discovered IDs from TE ===");
  console.log(JSON.stringify(ids, null, 2));

  printChecklist(ids);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

