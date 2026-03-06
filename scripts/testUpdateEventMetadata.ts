#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * Test script: Update Event Metadata
 *
 * Safely tests metadata refresh behavior on a single event in the production database.
 * Verifies that olt_url and other metadata fields update correctly.
 *
 * Usage:
 *   deno run --allow-env --allow-net --allow-read scripts/testUpdateEventMetadata.ts 2795400
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   TE_API_TOKEN
 *   TE_API_SECRET
 *
 * Safety features:
 *   - Only operates on a single specified event_id
 *   - Does NOT modify polling_enabled, ended_at, or polling flags
 *   - Does NOT modify historical pricing tables (event_price_hourly, event_price_daily)
 *   - Shows diff preview before writing
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?dts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// =============================================================================
// LOAD .env (matches Node scripts: upsertEvent.js, populateEventsByPerformer.js)
// =============================================================================

function loadEnv() {
  try {
    const projectRoot = new URL("..", import.meta.url);
    const content = Deno.readTextFileSync(new URL(".env", projectRoot));
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, "");
        if (!Deno.env.get(key)) Deno.env.set(key, val);
      }
    }
  } catch {
    // .env optional if vars already set
  }
}
loadEnv();

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TE_API_TOKEN = Deno.env.get("TE_API_TOKEN");
const TE_API_SECRET = Deno.env.get("TE_API_SECRET");
const TE_API_BASE_URL = Deno.env.get("TE_API_BASE_URL") ||
  "https://api.ticketevolution.com/v9";

const OLT_BASE_URL = "https://www.onlylocaltickets.com";
const DEFAULT_TZ = "America/Chicago";
const EVENT_DURATION_HOURS = 4;

// =============================================================================
// TE API CLIENT (matches existing signing logic)
// =============================================================================

async function generateSignature(
  method: string,
  path: string,
  params: Record<string, string> = {},
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const sortedParams: Record<string, string> = {};
  for (const key of sortedKeys) sortedParams[key] = params[key];

  const queryString = sortedKeys.length > 0
    ? "?" + new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
    : "?";

  const baseUrlObj = new URL(TE_API_BASE_URL);
  const hostname = baseUrlObj.hostname;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const stringToSign = `${method} ${hostname}${normalizedPath}${queryString}`;

  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(TE_API_SECRET!);
  const messageBytes = encoder.encode(stringToSign);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    messageBytes,
  );
  return encodeBase64(new Uint8Array(signatureBytes));
}

async function fetchTeEvent(eventId: number): Promise<TeEventResponse> {
  const path = `/v9/events/${eventId}`;
  const signature = await generateSignature("GET", path, {});

  const url = `${TE_API_BASE_URL}/events/${eventId}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": TE_API_TOKEN!,
      "X-Signature": signature,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `TE API Error: ${response.status} ${response.statusText} - ${errorBody}`,
    );
  }

  return await response.json();
}

// =============================================================================
// OLT URL BUILDER (matches existing logic in olt-url.ts)
// =============================================================================

type TeEvent = {
  id: number;
  name: string;
  occurs_at: string;
  venue?: { city?: string; state_code?: string; state?: string; name?: string };
  category?: { short_name?: string; slug?: string; name?: string };
  taxonomy?: { short_name?: string; slug?: string; name?: string };
  timezone?: string;
};

type TeEventResponse = {
  event?: TeEvent;
} & TeEvent;

function slugify(s: string | undefined): string {
  const PLACEHOLDER = "zzztriplehyphenzzz";
  let result = String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/\s+-\s+/g, "---");

  result = result.replace(/---/g, PLACEHOLDER);
  result = result.replace(/[^a-z0-9()]+/g, "-");
  result = result.replace(new RegExp(PLACEHOLDER, "g"), "---");
  result = result.replace(/-{4,}/g, "---");
  result = result.replace(/---/g, PLACEHOLDER);
  result = result.replace(/-{2}/g, "-");
  result = result.replace(new RegExp(PLACEHOLDER, "g"), "---");
  result = result.replace(/^-|-$/g, "");

  return result;
}

function formatTimeSlug(dateObj: Date, tz = DEFAULT_TZ): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const time = formatter.format(dateObj).toLowerCase();
  return time.replace(" ", "-");
}

function dateSlugParts(
  dateObj: Date,
  tz = DEFAULT_TZ,
): { dayName: string; dayNum: string; month: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const parts = formatter.formatToParts(dateObj);
  const dayName =
    parts.find((p) => p.type === "weekday")?.value?.toLowerCase() ?? "saturday";
  const dayNum = parts.find((p) => p.type === "day")?.value ?? "4";
  const month = parts.find((p) => p.type === "month")?.value?.toLowerCase() ??
    "july";
  return { dayName, dayNum, month };
}

function buildOltEventUrl(
  event: TeEvent,
  baseUrl = OLT_BASE_URL,
  quantity = 0,
): string {
  const e = event;
  const base = (baseUrl || OLT_BASE_URL).replace(/\/$/, "");
  const v = e.venue || {};
  const tz = e.timezone || DEFAULT_TZ;
  const dt = new Date(e.occurs_at);

  const nameSlug = slugify(e.name);
  const citySlug = slugify(v.city);
  const stateSlug = String(v.state_code || v.state || "").toLowerCase();
  const venueSlug = slugify(v.name);

  const { dayName, dayNum, month } = dateSlugParts(dt, tz);
  const timeSlug = formatTimeSlug(dt, tz);

  const cat = (e.category &&
    (e.category.short_name || e.category.slug || e.category.name)) ||
    (e.taxonomy &&
      (e.taxonomy.short_name || e.taxonomy.slug || e.taxonomy.name)) ||
    "";
  const catSlug = slugify(cat);

  const slug = `${nameSlug}-tickets` +
    `_${citySlug}-${stateSlug}` +
    `_${venueSlug}` +
    `_${dayName}-${dayNum}-${month}-at-${timeSlug}` +
    (catSlug ? `_${catSlug}` : "");

  const eventId = e.id;
  const qs =
    `listingsType=event&orderListBy=retail_price%20asc&quantity=${quantity}`;

  return `${base}/events/${slug}/${eventId}?${qs}`;
}

// =============================================================================
// MAIN SCRIPT
// =============================================================================

async function main() {
  // Parse command line argument
  const eventIdArg = Deno.args[0];
  if (!eventIdArg) {
    console.error(
      "Usage: deno run --allow-env --allow-net --allow-read scripts/testUpdateEventMetadata.ts <te_event_id>",
    );
    console.error(
      "Example: deno run --allow-env --allow-net --allow-read scripts/testUpdateEventMetadata.ts 2795400",
    );
    Deno.exit(1);
  }

  const teEventId = parseInt(eventIdArg, 10);
  if (isNaN(teEventId)) {
    console.error(`ERROR: Invalid event ID: ${eventIdArg}`);
    Deno.exit(1);
  }

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required",
    );
    Deno.exit(1);
  }
  if (!TE_API_TOKEN || !TE_API_SECRET) {
    console.error("ERROR: TE_API_TOKEN and TE_API_SECRET are required");
    Deno.exit(1);
  }

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  TEST: Update Event Metadata — Event ${teEventId}`);
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Step 1: Fetch current row from database
  console.log("Step 1: Fetching current event from database...\n");

  const { data: currentRow, error: fetchError } = await supabase
    .from("events")
    .select(
      "te_event_id, title, starts_at, ends_at, ended_at, polling_enabled, olt_url, updated_at",
    )
    .eq("te_event_id", teEventId)
    .single();

  if (fetchError || !currentRow) {
    console.error(`ERROR: Event not found in database: ${teEventId}`);
    console.error(fetchError?.message || "No matching row");
    Deno.exit(1);
  }

  console.log("  Database row (before update):");
  console.log(`    te_event_id:     ${currentRow.te_event_id}`);
  console.log(`    title:           ${currentRow.title}`);
  console.log(`    starts_at:       ${currentRow.starts_at}`);
  console.log(`    ends_at:         ${currentRow.ends_at}`);
  console.log(`    olt_url:         ${currentRow.olt_url || "(null)"}`);
  console.log(`    polling_enabled: ${currentRow.polling_enabled}`);
  console.log(`    updated_at:      ${currentRow.updated_at}`);
  console.log();

  // Step 2: Fetch fresh metadata from TE API
  console.log("Step 2: Fetching fresh metadata from TE API...\n");

  const teResponse = await fetchTeEvent(teEventId);
  const teEvent = teResponse.event || teResponse;

  if (!teEvent.name || !teEvent.occurs_at) {
    console.error(
      "ERROR: TE API response missing required fields (name, occurs_at)",
    );
    Deno.exit(1);
  }

  console.log("  TE API response fields:");
  console.log(`    name:       ${teEvent.name}`);
  console.log(`    occurs_at:  ${teEvent.occurs_at}`);
  console.log(
    `    venue:      ${
      teEvent.venue?.name || "(none)"
    } (${teEvent.venue?.city}, ${
      teEvent.venue?.state_code || teEvent.venue?.state
    })`,
  );
  console.log(
    `    category:   ${
      teEvent.category?.name || teEvent.taxonomy?.name || "(none)"
    }`,
  );
  console.log(`    timezone:   ${teEvent.timezone || DEFAULT_TZ}`);
  console.log();

  // Step 3: Build new metadata values
  console.log("Step 3: Building new metadata values...\n");

  const newTitle = teEvent.name;
  const newStartsAt = teEvent.occurs_at;
  const startMs = new Date(newStartsAt).getTime();
  const newEndsAt = new Date(startMs + EVENT_DURATION_HOURS * 60 * 60 * 1000)
    .toISOString();
  const newUpdatedAt = new Date().toISOString();

  // Build olt_url
  const newOltUrl = buildOltEventUrl({
    id: teEventId,
    name: newTitle,
    occurs_at: newStartsAt,
    venue: teEvent.venue,
    category: teEvent.category,
    taxonomy: teEvent.taxonomy,
    timezone: teEvent.timezone,
  });

  console.log("  New values:");
  console.log(`    title:      ${newTitle}`);
  console.log(`    starts_at:  ${newStartsAt}`);
  console.log(`    ends_at:    ${newEndsAt}`);
  console.log(`    olt_url:    ${newOltUrl}`);
  console.log(`    updated_at: ${newUpdatedAt}`);
  console.log();

  // Step 4: Show diff-style preview
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  DIFF PREVIEW");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const changes: string[] = [];

  if (currentRow.title !== newTitle) {
    console.log(`  title:`);
    console.log(`    - ${currentRow.title}`);
    console.log(`    + ${newTitle}`);
    changes.push("title");
  } else {
    console.log(`  title: (unchanged) ${currentRow.title}`);
  }

  if (currentRow.starts_at !== newStartsAt) {
    console.log(`  starts_at:`);
    console.log(`    - ${currentRow.starts_at}`);
    console.log(`    + ${newStartsAt}`);
    changes.push("starts_at");
  } else {
    console.log(`  starts_at: (unchanged) ${currentRow.starts_at}`);
  }

  if (currentRow.ends_at !== newEndsAt) {
    console.log(`  ends_at:`);
    console.log(`    - ${currentRow.ends_at}`);
    console.log(`    + ${newEndsAt}`);
    changes.push("ends_at");
  } else {
    console.log(`  ends_at: (unchanged) ${currentRow.ends_at}`);
  }

  if (currentRow.olt_url !== newOltUrl) {
    console.log(`  olt_url:`);
    console.log(`    - ${currentRow.olt_url || "(null)"}`);
    console.log(`    + ${newOltUrl}`);
    changes.push("olt_url");
  } else {
    console.log(`  olt_url: (unchanged)`);
  }

  console.log();

  // Step 5: Perform update (only metadata columns)
  if (changes.length === 0) {
    console.log("✓ No changes detected. Database row is already up to date.\n");
    Deno.exit(0);
  }

  console.log(
    `Updating ${changes.length} field(s): ${changes.join(", ")}...\n`,
  );

  // SAFETY: Only update metadata columns. Do NOT touch polling_enabled, ended_at, or pricing tables.
  const updatePayload = {
    title: newTitle,
    starts_at: newStartsAt,
    ends_at: newEndsAt,
    olt_url: newOltUrl,
    updated_at: newUpdatedAt,
  };

  const { error: updateError } = await supabase
    .from("events")
    .update(updatePayload)
    .eq("te_event_id", teEventId);

  if (updateError) {
    console.error("ERROR: Failed to update event:", updateError.message);
    Deno.exit(1);
  }

  console.log("✓ Update completed.\n");

  // Step 6: Re-fetch and confirm
  console.log("Step 6: Re-fetching row to confirm update...\n");

  const { data: updatedRow, error: refetchError } = await supabase
    .from("events")
    .select(
      "te_event_id, title, starts_at, ends_at, ended_at, polling_enabled, olt_url, updated_at",
    )
    .eq("te_event_id", teEventId)
    .single();

  if (refetchError || !updatedRow) {
    console.error("ERROR: Failed to re-fetch event:", refetchError?.message);
    Deno.exit(1);
  }

  console.log("  Database row (after update):");
  console.log(`    te_event_id:     ${updatedRow.te_event_id}`);
  console.log(`    title:           ${updatedRow.title}`);
  console.log(`    starts_at:       ${updatedRow.starts_at}`);
  console.log(`    ends_at:         ${updatedRow.ends_at}`);
  console.log(`    olt_url:         ${updatedRow.olt_url || "(null)"}`);
  console.log(`    polling_enabled: ${updatedRow.polling_enabled}`);
  console.log(`    updated_at:      ${updatedRow.updated_at}`);
  console.log();

  // Verify olt_url was updated correctly
  if (updatedRow.olt_url === newOltUrl) {
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("  ✓ SUCCESS: olt_url updated correctly");
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );
  } else {
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("  ⚠️  WARNING: olt_url does not match expected value");
    console.log(`     Expected: ${newOltUrl}`);
    console.log(`     Got:      ${updatedRow.olt_url}`);
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );
    Deno.exit(1);
  }

  // Confirm polling flags were NOT modified
  if (
    updatedRow.polling_enabled === currentRow.polling_enabled &&
    updatedRow.ended_at === currentRow.ended_at
  ) {
    console.log(
      "  ✓ SAFETY CHECK: polling_enabled and ended_at were NOT modified.\n",
    );
  } else {
    console.log("  ⚠️  WARNING: polling flags changed unexpectedly!");
    console.log(
      `     polling_enabled: ${currentRow.polling_enabled} → ${updatedRow.polling_enabled}`,
    );
    console.log(
      `     ended_at: ${currentRow.ended_at} → ${updatedRow.ended_at}`,
    );
  }
}

// Run
main().catch((err) => {
  console.error("ERROR:", err.message);
  Deno.exit(1);
});
