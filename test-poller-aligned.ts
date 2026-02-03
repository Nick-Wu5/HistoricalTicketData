#!/usr/bin/env -S deno run --allow-net --allow-env

// Fallback typing for editors not running Deno language server.
declare const Deno: {
  env: { get(name: string): string | undefined };
  args: string[];
  exit(code?: number): never;
};

/**
 * Poller-aligned test script.
 * Uses the same TicketEvolutionClient + aggregatePrices as the hourly poller
 * to compare raw stats vs. filtered aggregates.
 */

import { TicketEvolutionClient } from "./supabase/functions/_shared/te-api.ts";
import { aggregatePrices } from "./supabase/functions/_shared/utils.ts";

const API_TOKEN = Deno.env.get("TE_API_TOKEN") ?? "";
const API_SECRET = Deno.env.get("TE_API_SECRET") ?? "";
const EVENT_ID = Deno.env.get("TE_EVENT_ID") ?? Deno.args[0] ?? "";

if (!API_TOKEN || !API_SECRET) {
  console.error("Missing TE_API_TOKEN or TE_API_SECRET in env.");
  Deno.exit(1);
}

if (!EVENT_ID) {
  console.error("Missing event id. Set TE_EVENT_ID or pass as first arg.");
  Deno.exit(1);
}

const teClient = new TicketEvolutionClient(API_TOKEN, API_SECRET);

console.log(`🧪 Poller-aligned test for event ${EVENT_ID}...\n`);

const response = await teClient.get("/listings", { event_id: EVENT_ID });
const listings = response.ticket_groups || response.listings || [];

console.log(`✅ Listings returned: ${listings.length}`);

const rawPrices: number[] = listings
  .map((l: any) => l.retail_price || l.price)
  .map((p: any) => (typeof p === "string" ? parseFloat(p) : p))
  .filter((p: any): p is number => typeof p === "number" && !isNaN(p) && p > 0);

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
    "\n⚠️  aggregatePrices returned null (no valid ticket listings).",
  );
  Deno.exit(0);
}

console.log("\n📊 Poller aggregates (same logic as hourly poller):");
console.log(`   Min: $${aggregates.min_price.toFixed(2)}`);
console.log(`   Avg: $${aggregates.avg_price.toFixed(2)}`);
console.log(`   Max: $${aggregates.max_price.toFixed(2)}`);
console.log(`   Listing count: ${aggregates.listing_count}`);
