#!/usr/bin/env node
/**
 * Ticket Evolution Event Upserter
 * 
 * Populates or updates a single Ticket Evolution event in Supabase public.events.
 * 
 * Usage:
 *   node scripts/upsertEvent.js <te_event_id>
 *   node scripts/upsertEvent.js 2795400 --olt_url="https://..." --force_polling_enabled=true
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { buildOltEventUrl } = require("./olt-url-utils.js");

// --- 1. Load Environment Variables ---
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TE_API_TOKEN = process.env.TE_API_TOKEN;
const TE_API_SECRET = process.env.TE_API_SECRET;
const TE_API_BASE_URL = process.env.TE_API_BASE_URL || "https://api.ticketevolution.com";

if (!SUPABASE_URL || !SUPABASE_KEY || !TE_API_TOKEN || !TE_API_SECRET) {
  console.error("ERROR: Missing required environment variables in .env");
  console.error("Required: SUPABASE_URL, SUPABASE_SECRET_KEY, TE_API_TOKEN, TE_API_SECRET");
  process.exit(1);
}

// --- 2. Parse CLI Arguments ---
const args = process.argv.slice(2);
const te_event_id = args.find(a => !a.startsWith('--'));

if (!te_event_id) {
  console.error("ERROR: Missing te_event_id argument.");
  console.error("Usage: node scripts/upsertEvent.js <te_event_id> [--olt_url=...] [--force_polling_enabled=true|false]");
  process.exit(1);
}

const olt_url_arg = args.find(a => a.startsWith('--olt_url='))?.split('=')[1];
const force_polling_enabled_arg = args.find(a => a.startsWith('--force_polling_enabled='));
const force_polling_enabled = force_polling_enabled_arg ? force_polling_enabled_arg.split('=')[1] === 'true' : null;

// --- 3. TE API Signing & Fetching ---
async function fetchTeEvent(id) {
  const method = "GET";
  const baseUrlObj = new URL(TE_API_BASE_URL);
  const hostname = baseUrlObj.hostname;
  const path = `/v9/events/${id}`;
  const queryString = "?"; // TE requires "?" even if empty
  const stringToSign = `${method} ${hostname}${path}${queryString}`;

  const signature = crypto
    .createHmac("sha256", TE_API_SECRET)
    .update(stringToSign)
    .digest("base64");

  const url = `${TE_API_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Token": TE_API_TOKEN,
      "X-Signature": signature,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TE API Error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

// --- 4. Main Logic ---
async function main() {
  console.log(`\nFetching TE event ${te_event_id}...`);
  
  try {
    const event = await fetchTeEvent(te_event_id);
    const title = event.name;
    const starts_at = event.occurs_at;
    
    if (!title || !starts_at) {
      throw new Error("TE API response missing name or occurs_at");
    }

    const startDate = new Date(starts_at);
    const endDate = new Date(startDate.getTime() + (4 * 60 * 60 * 1000)); // +4 hours
    const ends_at = endDate.toISOString();

    const now = new Date();
    let polling_enabled = true;
    let ended_at = null;

    if (now > endDate) {
      polling_enabled = false;
      ended_at = now.toISOString();
    }

    // Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Prepare update object
    const upsertData = {
      te_event_id: parseInt(te_event_id, 10),
      title: title,
      starts_at: starts_at,
      ends_at: ends_at,
      updated_at: now.toISOString(),
    };

    // Conditional Fields (Optional Overrides)
    if (olt_url_arg !== undefined) {
      upsertData.olt_url = olt_url_arg;
    } else {
      // Auto-generate from TE event data (venue, category, occurs_at)
      try {
        upsertData.olt_url = buildOltEventUrl(event);
      } catch (err) {
        console.warn("Could not generate olt_url:", err.message);
      }
    }
    
    if (force_polling_enabled !== null) {
      upsertData.polling_enabled = force_polling_enabled;
    } else if (now > endDate) {
      // If past end time and not forced, ensure polling is disabled
      upsertData.polling_enabled = false;
      // Also set ended_at if it was just determined to have ended
      upsertData.ended_at = ended_at;
    }

    // Check if event exists to decide if we should set ended_at only once
    const { data: existingEvent } = await supabase
      .from("events")
      .select("ended_at, olt_url, polling_enabled")
      .eq("te_event_id", te_event_id)
      .maybeSingle();

    const isUpdate = !!existingEvent;

    // If it's an update and we don't have overrides, keep existing olt_url/polling if not explicitly passing them
    if (isUpdate) {
      if (olt_url_arg === undefined) {
        // Keep existing olt_url (don't include in upsert object if we want to just "not overwrite", 
        // but Supabase upsert usually overwrites everything. So we omit it if we want to leave it as is.)
        delete upsertData.olt_url;
      }
      if (force_polling_enabled === null) {
        delete upsertData.polling_enabled;
      }
      
      // Don't overwrite ended_at if it's already set
      if (existingEvent.ended_at && upsertData.ended_at) {
        delete upsertData.ended_at;
      }
    } else {
      // For new record, defaults if not provided
      if (upsertData.polling_enabled === undefined) {
        upsertData.polling_enabled = (now <= endDate);
      }
      if (upsertData.polling_enabled === false && !upsertData.ended_at) {
        upsertData.ended_at = ended_at;
      }
    }

    const { error: upsertError } = await supabase
      .from("events")
      .upsert(upsertData, { onConflict: "te_event_id" });

    if (upsertError) {
      throw new Error(`Supabase Upsert Error: ${upsertError.message}`);
    }

    // Final Summary
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`${isUpdate ? "✅ UPDATE SUCCESSFUL" : "✅ INSERT SUCCESSFUL"}`);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  te_event_id:      ${te_event_id}`);
    console.log(`  title:            ${title}`);
    console.log(`  starts_at:        ${starts_at}`);
    console.log(`  ends_at:          ${ends_at}`);
    console.log(`  polling_enabled:  ${upsertData.polling_enabled ?? existingEvent?.polling_enabled ?? "true"}`);
    if (upsertData.ended_at || existingEvent?.ended_at) {
      console.log(`  ended_at:         ${upsertData.ended_at || existingEvent?.ended_at}`);
    }
    if (upsertData.olt_url || existingEvent?.olt_url) {
      console.log(`  olt_url:          ${upsertData.olt_url || existingEvent?.olt_url}`);
    }
    console.log("═══════════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    process.exit(1);
  }
}

main();
