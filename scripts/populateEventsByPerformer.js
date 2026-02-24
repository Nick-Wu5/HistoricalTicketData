#!/usr/bin/env node
/**
 * Ticket Evolution performer-based event population script.
 *
 * Fetches TE Events/Index by performer_id and upserts events into Supabase.
 * Designed for World Cup bulk ingestion (target: 104 events).
 *
 * Usage:
 *   node scripts/populateEventsByPerformer.js
 *   node scripts/populateEventsByPerformer.js --dry_run=true
 *   node scripts/populateEventsByPerformer.js --dry_run=false --performer_id=15989 --expect_count=104
 *   node scripts/populateEventsByPerformer.js --primary_performer=true
 *   node scripts/populateEventsByPerformer.js --insert_only_new=true --dry_run=false
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { buildOltEventUrl } = require("./olt-url-utils.js");

const DEFAULT_PERFORMER_ID = 15989;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_EXPECT_COUNT = 104;
const EVENT_DURATION_HOURS = 4;

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

function parseArgs(argv) {
  const getArg = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=")[1] : fallback;
  };

  const performer_id = Number.parseInt(
    getArg("performer_id", String(DEFAULT_PERFORMER_ID)),
    10,
  );
  const per_page = Math.max(
    1,
    Math.min(
      100,
      Number.parseInt(getArg("per_page", String(DEFAULT_PER_PAGE)), 10),
    ),
  );
  const expect_count = Number.parseInt(
    getArg("expect_count", String(DEFAULT_EXPECT_COUNT)),
    10,
  );
  const dry_run = getArg("dry_run", "true") === "true";
  const insert_only_new = getArg("insert_only_new", "false") === "true";
  const primaryPerformerRaw = getArg("primary_performer", "");
  const primary_performer = primaryPerformerRaw === ""
    ? null
    : primaryPerformerRaw === "true";

  if (!Number.isFinite(performer_id) || performer_id <= 0) {
    throw new Error("Invalid performer_id. Expected a positive integer.");
  }

  return {
    performer_id,
    per_page,
    expect_count,
    dry_run,
    insert_only_new,
    primary_performer,
  };
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

async function fetchEventsPage(config, page) {
  const params = {
    performer_id: config.performer_id,
    page,
    per_page: config.per_page,
  };
  if (config.primary_performer !== null) {
    params.primary_performer = config.primary_performer;
  }

  const req = buildSignedGet(
    config.te_base_url,
    config.te_token,
    config.te_secret,
    "/events",
    params,
  );
  const response = await fetch(req.url, { method: "GET", headers: req.headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TE Events/Index failed: ${response.status} ${body}`);
  }
  return response.json();
}

function parseVenueLocation(location) {
  if (!location || typeof location !== "string") {
    return { city: undefined, state_code: undefined };
  }
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    return { city: parts[0], state_code: parts[1] };
  }
  return { city: location.trim(), state_code: undefined };
}

function mapTeEventToUpsertRow(teEvent) {
  const title = teEvent?.name ? String(teEvent.name) : null;
  const startsAt = teEvent?.occurs_at ? String(teEvent.occurs_at) : null;
  const teEventId = Number.parseInt(String(teEvent?.id ?? ""), 10);

  if (!title || !startsAt || !Number.isFinite(teEventId) || teEventId <= 0) {
    return null;
  }

  const startMs = new Date(startsAt).getTime();
  if (Number.isNaN(startMs)) return null;
  const now = new Date();
  const endsAtDate = new Date(startMs + EVENT_DURATION_HOURS * 60 * 60 * 1000);
  const endsAt = endsAtDate.toISOString();
  const hasEnded = now.getTime() > endsAtDate.getTime();

  const venue = teEvent?.venue ?? {};
  const fallback = parseVenueLocation(venue.location);
  const forUrl = {
    id: teEventId,
    name: title,
    occurs_at: startsAt,
    venue: {
      name: venue.name,
      city: venue.city || fallback.city,
      state_code: venue.state_code || fallback.state_code || venue.state,
      state: venue.state,
    },
    category: teEvent.category,
    taxonomy: teEvent.taxonomy,
    timezone: teEvent.timezone || venue.time_zone,
  };

  let oltUrl = null;
  try {
    oltUrl = buildOltEventUrl(forUrl);
  } catch (_err) {
    // Non-fatal here. Metadata refresh can regenerate later.
  }

  return {
    te_event_id: teEventId,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    polling_enabled: !hasEnded,
    ended_at: hasEnded ? now.toISOString() : null,
    updated_at: now.toISOString(),
    ...(oltUrl ? { olt_url: oltUrl } : {}),
  };
}

async function fetchExistingTeEventIds(supabase) {
  const pageSize = 1000;
  let from = 0;
  const ids = new Set();

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("events")
      .select("te_event_id")
      .order("te_event_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed loading existing events: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const id = Number.parseInt(String(row?.te_event_id ?? ""), 10);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

async function main() {
  loadEnv();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TE_API_TOKEN = process.env.TE_API_TOKEN;
  const TE_API_SECRET = process.env.TE_API_SECRET;
  const TE_API_BASE_URL = process.env.TE_API_BASE_URL ||
    "https://api.ticketevolution.com";

  if (!SUPABASE_URL || !SUPABASE_KEY || !TE_API_TOKEN || !TE_API_SECRET) {
    throw new Error(
      "Missing required env vars: SUPABASE_URL, SUPABASE_SECRET_KEY(or SERVICE_ROLE), TE_API_TOKEN, TE_API_SECRET",
    );
  }

  const options = parseArgs(process.argv.slice(2));
  const config = {
    ...options,
    te_base_url: TE_API_BASE_URL,
    te_token: TE_API_TOKEN,
    te_secret: TE_API_SECRET,
  };

  console.log("====================================================");
  console.log("Populate Events by Performer");
  console.log("====================================================");
  console.log(`performer_id: ${config.performer_id}`);
  console.log(`per_page: ${config.per_page}`);
  console.log(`dry_run: ${config.dry_run}`);
  console.log(`insert_only_new: ${config.insert_only_new}`);
  console.log(`expect_count: ${config.expect_count}`);
  console.log(
    `primary_performer: ${
      config.primary_performer === null ? "(not set)" : config.primary_performer
    }`,
  );
  console.log("====================================================\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const fetched = [];
  let page = 1;
  let totalEntries = null;

  while (true) {
    const payload = await fetchEventsPage(config, page);
    const pageEvents = Array.isArray(payload.events) ? payload.events : [];
    totalEntries = totalEntries ?? Number(payload.total_entries || 0);
    const currentPage = Number(payload.current_page || page);
    const perPage = Number(payload.per_page || config.per_page);

    console.log(`Fetched page ${currentPage}: ${pageEvents.length} events`);
    fetched.push(...pageEvents);

    const doneByCount = totalEntries > 0 &&
      (currentPage * perPage >= totalEntries);
    if (pageEvents.length === 0 || doneByCount) break;
    page += 1;
  }

  // Uniqueness by te_event_id
  const byId = new Map();
  for (const e of fetched) {
    const id = Number.parseInt(String(e?.id ?? ""), 10);
    if (Number.isFinite(id) && id > 0) byId.set(id, e);
  }
  const uniqueEvents = Array.from(byId.values());

  console.log(`\nTotal fetched rows: ${fetched.length}`);
  console.log(`Unique te_event_id count: ${uniqueEvents.length}`);
  if (Number.isFinite(config.expect_count) && config.expect_count > 0) {
    if (uniqueEvents.length !== config.expect_count) {
      console.warn(
        `WARNING: expected ${config.expect_count} unique events, got ${uniqueEvents.length}`,
      );
    } else {
      console.log(`Count check passed: ${config.expect_count}`);
    }
  }

  const rows = uniqueEvents.map(mapTeEventToUpsertRow).filter(Boolean);
  const skipped = uniqueEvents.length - rows.length;
  if (skipped > 0) {
    console.warn(`Skipped ${skipped} events due to mapping/validation issues.`);
  }

  let rowsToWrite = rows;
  if (config.insert_only_new) {
    const existingIds = await fetchExistingTeEventIds(supabase);
    rowsToWrite = rows.filter((row) => !existingIds.has(row.te_event_id));
    const alreadyExisting = rows.length - rowsToWrite.length;
    console.log(`Existing events in DB: ${existingIds.size}`);
    console.log(`Already present from fetched set: ${alreadyExisting}`);
    console.log(`New events to insert: ${rowsToWrite.length}`);
  }

  if (config.dry_run) {
    console.log("\nDRY RUN (no writes).");
    const action = config.insert_only_new ? "insert" : "upsert";
    console.log(`Would ${action} ${rowsToWrite.length} rows into public.events`);
    console.log("Sample (first 5):");
    console.log(JSON.stringify(rowsToWrite.slice(0, 5), null, 2));
    return;
  }

  if (rowsToWrite.length === 0) {
    console.log("\nNo rows to write. Done.");
    return;
  }

  if (config.insert_only_new) {
    const { error: insertError } = await supabase
      .from("events")
      .insert(rowsToWrite);
    if (insertError) {
      throw new Error(`Supabase insert failed: ${insertError.message}`);
    }
    console.log(`\nInsert complete: ${rowsToWrite.length} new rows submitted.`);
  } else {
    const { error: upsertError } = await supabase
      .from("events")
      .upsert(rowsToWrite, { onConflict: "te_event_id" });
    if (upsertError) {
      throw new Error(`Supabase upsert failed: ${upsertError.message}`);
    }
    console.log(`\nUpsert complete: ${rowsToWrite.length} rows submitted.`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});

