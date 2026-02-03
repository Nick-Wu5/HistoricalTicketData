/**
 * Helper to calculate price aggregates from a list of ticket listings
 * Includes data validation and outlier detection
 */
export function aggregatePrices(listings: any[]) {
  if (!listings || listings.length === 0) {
    console.log("aggregatePrices: Input listings is empty/null");
    return null;
  }

  // Step 1: Filter for valid ticket listings
  const ticketListings = listings.filter(l => {
    // Exclude non-event type items
    if (l.type && l.type !== 'event') {
        // console.log(`Skipping non-event type: ${l.type}`); // Too verbose
        return false;
    }

    // Exclude non-ticket items based on format/notes
    const isTicket = l.format === 'ticket' ||
                     (!l.notes?.toLowerCase().includes('parking') &&
                      !l.notes?.toLowerCase().includes('tailgate'));

    // Data quality checks for price
    const price = l.retail_price || l.price; 
    if (!price || price <= 0) {
        // console.log(`Skipping invalid price: ${price}`);
        return false;
    }
    const hasValidPrice = typeof price === 'number' &&
                          price > 0 &&
                          price < 100000; // Sanity check: no ticket > $100k

    // Data quality checks for quantity
    const hasValidQuantity = !l.quantity ||
                             (l.quantity > 0 && l.quantity < 10000);

    return isTicket && hasValidPrice && hasValidQuantity;
  });

  if (ticketListings.length === 0) {
    return null;
  }

  // Step 2: Extract prices (Retail only)
  const prices = ticketListings
    .map(l => {
        // Prioritize explicit retail_price, fallback to generic price. Ignore wholesale_price.
        const val = l.retail_price || l.price;
        return typeof val === 'string' ? parseFloat(val) : val;
    })
    .filter(p => typeof p === 'number' && !isNaN(p) && p > 0);

  // Step 3: Remove outliers using statistical method
  // Only apply if we have enough data points
  let filteredPrices = prices;
  if (prices.length >= 10) {
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    
    // Remove prices more than 3 standard deviations from mean
    filteredPrices = prices.filter(p => Math.abs(p - mean) <= 3 * stdDev);
    
    // If we filtered out too many, keep original (might be legitimate price spread)
    if (filteredPrices.length < prices.length * 0.5) {
      filteredPrices = prices;
    }
  }

  // Step 4: Calculate aggregates
  const min = Math.min(...filteredPrices);
  const max = Math.max(...filteredPrices);
  const avg = filteredPrices.reduce((sum, p) => sum + p, 0) / filteredPrices.length;

  return {
    min_price: parseFloat(min.toFixed(2)),
    avg_price: parseFloat(avg.toFixed(2)),
    max_price: parseFloat(max.toFixed(2)),
    listing_count: ticketListings.length,
    price_basis: 'ticket'
  };
}

/**
 * Validate event data before processing
 */
export function validateEvent(event: any): boolean {
  return !!(
    event &&
    event.id &&
    event.te_event_id &&
    event.title
  );
}
