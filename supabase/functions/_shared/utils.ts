/**
 * Calculate price aggregates from TE API listings.
 * Filters: type=event, retail_price valid, available_quantity>=2, splits includes 2.
 * Excludes listings with OLT non-buyable phrases in notes (rejected/not-fulfilled/pending).
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

export function aggregatePrices(listings: Listing[]) {
  if (!listings || listings.length === 0) {
    console.log("aggregatePrices: Input listings is empty/null");
    return null;
  }

  // Step 1: Filter to eligible event listings
  const eligibleListings = listings.filter((listing) => {
    if (listing.type !== "event") return false;
    if (!isBuyableListing(listing)) return false;

    const rawPrice = listing.retail_price;
    const price =
      typeof rawPrice === "string" ? parseFloat(rawPrice) : rawPrice;
    const hasValidPrice =
      typeof price === "number" &&
      !isNaN(price) &&
      price > 0 &&
      price < 100_000; // Sanity: no ticket > $100k

    const qty = listing.available_quantity;
    const hasValidQuantity =
      typeof qty === "number" && qty >= 2 && qty < 10_000;

    const splits = listing.splits ?? [];
    const canPurchaseTwo = Array.isArray(splits) && splits.includes(2);

    return hasValidPrice && hasValidQuantity && canPurchaseTwo;
  });

  if (eligibleListings.length === 0) return null;

  // Step 2: Extract retail prices as numbers
  const prices = eligibleListings
    .map((listing) => {
      const val = listing.retail_price;
      return typeof val === "string" ? parseFloat(val) : val;
    })
    .filter((p): p is number => typeof p === "number" && !isNaN(p) && p > 0);

  if (prices.length === 0) return null;

  // Step 3: Compute min/avg/max for event_price_hourly
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  return {
    min_price: parseFloat(minPrice.toFixed(2)),
    avg_price: parseFloat(avgPrice.toFixed(2)),
    max_price: parseFloat(maxPrice.toFixed(2)),
    listing_count: eligibleListings.length,
    price_basis: "ticket",
  };
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
