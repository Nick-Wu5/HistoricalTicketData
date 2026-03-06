/**
 * Calculate price aggregates from TE API listings.
 *
 * FILTER PHILOSOPHY: General market pricing
 * This filter includes all purchasable event listings to reflect the overall market price,
 * not just listings that allow specific purchase quantities (e.g., pairs).
 *
 * Filters applied:
 *   - type=event (exclude parking, merchandise, etc.)
 *   - valid retail_price (> 0, < $100k sanity cap)
 *   - available_quantity >= 1 (at least one ticket available)
 *   - excludes canceled/rejected inventory via note phrases
 *
 * Returns min/avg/max and listing_count for event_price_hourly writes.
 */
type Listing = {
  type: string;
  retail_price: number | string;
  available_quantity: number;
  splits?: number[];
  public_notes?: string;
  notes?: string;
};

/**
 * Exclude listings that OLT/prior implementation would not treat as "starting at"
 * (rejected, not-fulfilled, pending inventory).
 */
function isBuyableListing(listing: Listing): boolean {
  const notes = String(
    listing.public_notes ?? listing.notes ?? "",
  ).toLowerCase();
  const badPhrases = [
    "will be rejected",
    "accepted but not fulfilled",
    "will be accepted but not fulfilled",
    "will remain pending",
    "not fulfilled",
  ];
  return !badPhrases.some((phrase) => notes.includes(phrase));
}

/**
 * Calculate trimmed mean - removes top and bottom percentage before averaging.
 * This reduces the impact of outlier listings (scalper premiums, data errors).
 * @param sortedPrices - Array of prices, must be sorted ascending
 * @param trimPercent - Percentage to trim from each end (default 0.1 = 10%)
 * @returns Trimmed mean value
 */
function calculateTrimmedMean(
  sortedPrices: number[],
  trimPercent = 0.1,
): number {
  const len = sortedPrices.length;

  // Need at least 3 items to trim meaningfully
  if (len < 3) {
    return sortedPrices.reduce((sum, p) => sum + p, 0) / len;
  }

  const trimCount = Math.floor(len * trimPercent);

  // If trim would remove all items, fall back to simple mean
  if (trimCount * 2 >= len) {
    return sortedPrices.reduce((sum, p) => sum + p, 0) / len;
  }

  const trimmed = sortedPrices.slice(trimCount, len - trimCount);
  return trimmed.reduce((sum, p) => sum + p, 0) / trimmed.length;
}

/**
 * Diagnostic counters track where listings are filtered out so we can
 * understand why an event temporarily had no eligible listings.
 */
export type DiagnosticCounters = {
  raw_listing_count: number;
  event_listing_count: number;
  quantity_match_count: number;
  buyable_listing_count: number;
};

export type SkipReason =
  | "no_te_listings"
  | "no_event_listings"
  | "no_valid_quantity" // renamed from no_quantity_match for clarity
  | "no_buyable_listings"
  | "unknown"
  | null;

export type AggregateResult = {
  min_price: number;
  avg_price: number;
  max_price: number;
  listing_count: number;
  price_basis: string;
} | null;

export type AggregateWithDiagnostics = {
  aggregates: AggregateResult;
  diagnostics: DiagnosticCounters;
  skip_reason: SkipReason;
};

/**
 * Aggregate prices with diagnostic counters for debugging skipped events.
 * Tracks listing counts at each filter stage to identify why events have no eligible listings.
 */
export function aggregatePricesWithDiagnostics(
  listings: Listing[],
): AggregateWithDiagnostics {
  // Initialize diagnostic counters
  const diagnostics: DiagnosticCounters = {
    raw_listing_count: 0,
    event_listing_count: 0,
    quantity_match_count: 0,
    buyable_listing_count: 0,
  };

  // Stage 0: Raw listing count
  diagnostics.raw_listing_count = listings?.length ?? 0;

  if (!listings || listings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_te_listings",
    };
  }

  // Stage 1: Filter to event-type listings with valid prices
  const eventListings = listings.filter((listing) => {
    if (listing.type !== "event") return false;

    const rawPrice = listing.retail_price;
    const price = typeof rawPrice === "string"
      ? parseFloat(rawPrice)
      : rawPrice;
    const hasValidPrice = typeof price === "number" &&
      !isNaN(price) &&
      price > 0 &&
      price < 100_000;

    return hasValidPrice;
  });
  diagnostics.event_listing_count = eventListings.length;

  if (eventListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_event_listings",
    };
  }

  // Stage 2: Filter by quantity eligibility
  // General market pricing: include any listing with at least 1 available ticket.
  // We do NOT require qty >= 2 or splits.includes(2) since we want to reflect
  // the overall market, not just the "2-ticket purchase" subset.
  const quantityListings = eventListings.filter((listing) => {
    const qty = listing.available_quantity;
    // Require at least 1 ticket, cap at 10k to filter obvious data errors
    return typeof qty === "number" && qty >= 1 && qty < 10_000;
  });
  diagnostics.quantity_match_count = quantityListings.length;

  if (quantityListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_valid_quantity",
    };
  }

  // Stage 3: Filter by buyable status (exclude rejected/pending notes)
  const buyableListings = quantityListings.filter(isBuyableListing);
  diagnostics.buyable_listing_count = buyableListings.length;

  if (buyableListings.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "no_buyable_listings",
    };
  }

  // Stage 4: Extract and validate prices
  const prices = buyableListings
    .map((listing) => {
      const val = listing.retail_price;
      return typeof val === "string" ? parseFloat(val) : val;
    })
    .filter((p): p is number => typeof p === "number" && !isNaN(p) && p > 0);

  if (prices.length === 0) {
    return {
      aggregates: null,
      diagnostics,
      skip_reason: "unknown",
    };
  }

  // Stage 5: Compute aggregates
  const sortedPrices = prices.slice().sort((a, b) => a - b);
  const minPrice = sortedPrices[0];
  const maxPrice = sortedPrices[sortedPrices.length - 1];
  const avgPrice = calculateTrimmedMean(sortedPrices, 0.1);

  return {
    aggregates: {
      min_price: parseFloat(minPrice.toFixed(2)),
      avg_price: parseFloat(avgPrice.toFixed(2)),
      max_price: parseFloat(maxPrice.toFixed(2)),
      listing_count: buyableListings.length,
      price_basis: "ticket",
    },
    diagnostics,
    skip_reason: null,
  };
}

/**
 * Legacy aggregatePrices function - wrapper for backwards compatibility.
 * Use aggregatePricesWithDiagnostics for new code that needs diagnostic data.
 */
export function aggregatePrices(listings: Listing[]): AggregateResult {
  const result = aggregatePricesWithDiagnostics(listings);
  return result.aggregates;
}

/**
 * Validate event record has required fields before processing.
 * Used for incoming event data validation.
 */
type EventRecord = {
  id?: string | number;
  te_event_id?: string | number;
  title?: string;
};

export function validateEvent(event: EventRecord): boolean {
  return !!(event?.id && event?.te_event_id && event?.title);
}
