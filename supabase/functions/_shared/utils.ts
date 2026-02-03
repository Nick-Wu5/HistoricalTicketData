/**
 * Helper to calculate price aggregates from a list of ticket listings
 * Includes data validation and outlier detection
 */
type Listing = {
  type: string;
  retail_price: number | string;
  available_quantity: number;
};

export function aggregatePrices(listings: Listing[]) {
  if (!listings || listings.length === 0) {
    console.log("aggregatePrices: Input listings is empty/null");
    return null;
  }

  // Step 1: Filter for valid event listings
  const ticketListings = listings.filter((l) => {
    // Require event listings only
    if (l.type !== "event") {
      return false;
    }

    // Data quality checks for retail price only
    const rawPrice = l.retail_price;
    const price = typeof rawPrice === "string"
      ? parseFloat(rawPrice)
      : rawPrice;
    if (typeof price !== "number" || isNaN(price) || price <= 0) {
      // console.log(`Skipping invalid retail_price: ${rawPrice}`);
      return false;
    }
    const hasValidPrice = price > 0 &&
      price < 100000; // Sanity check: no ticket > $100k

    // Data quality checks for available quantity (require at least 2)
    const availableQuantity = l.available_quantity;
    const hasValidQuantity = typeof availableQuantity === "number" &&
      availableQuantity >= 2 &&
      availableQuantity < 10000;

    return hasValidPrice && hasValidQuantity;
  });

  if (ticketListings.length === 0) {
    return null;
  }

  // Step 2: Extract prices (Retail only)
  const prices = ticketListings
    .map((l) => {
      // Retail price only (ignore generic price/wholesale).
      const val = l.retail_price;
      return typeof val === "string" ? parseFloat(val) : val;
    })
    .filter((p): p is number => typeof p === "number" && !isNaN(p) && p > 0);

  if (prices.length === 0) {
    return null;
  }

  // Step 3: Calculate aggregates (no stddev filtering)
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  return {
    min_price: parseFloat(min.toFixed(2)),
    avg_price: parseFloat(avg.toFixed(2)),
    max_price: parseFloat(max.toFixed(2)),
    listing_count: ticketListings.length,
    price_basis: "ticket",
  };
}

/**
 * Validate event data before processing
 */
type EventRecord = {
  id?: string | number;
  te_event_id?: string | number;
  title?: string;
};

export function validateEvent(event: EventRecord): boolean {
  return !!(
    event &&
    event.id &&
    event.te_event_id &&
    event.title
  );
}
