/**
 * OLT (OnlyLocalTickets) event URL generator
 *
 * Builds SEO-friendly event URLs matching the pattern:
 * /events/<event>-tickets_<city>-<state>_<venue>_<day>-<dd>-<month>-at-<time>_<category>/<te_event_id>?...
 *
 * Example:
 * /events/2026-world-cup-soccer---match-90-(w73-vs-w75)-tickets_houston-tx_nrg-stadium_saturday-4-july-at-12:00-pm_world-cup/2795538?listingsType=event&orderListBy=retail_price%20asc&quantity=0
 */

const OLT_BASE_URL = "https://www.onlylocaltickets.com";
const DEFAULT_TZ = "America/Chicago"; // Houston / Central for World Cup

/**
 * Slugify text for URL segments.
 * Preserves parentheses (e.g. "(w73-vs-w75)") as they appear in event titles.
 * Matches the pattern seen in actual OLT URLs, including triple hyphens from " - " patterns.
 */
function slugify(s) {
  const PLACEHOLDER = "zzztriplehyphenzzz"; // Use letters that won't be replaced by [^a-z0-9()]
  let result = String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/\s+-\s+/g, "---"); // Replace " - " (space-dash-space) with triple hyphen first
  
  // Replace non-alphanumeric (except parentheses and hyphens) with hyphens
  // Use a placeholder to protect triple hyphens
  result = result.replace(/---/g, PLACEHOLDER);
  result = result.replace(/[^a-z0-9()]+/g, "-");
  result = result.replace(new RegExp(PLACEHOLDER, 'g'), "---");
  
  // Collapse sequences of 4+ hyphens to triple hyphen
  result = result.replace(/-{4,}/g, "---");
  // Collapse double hyphens to single, but preserve triple hyphens
  // Use a workaround: temporarily mark triple hyphens, collapse doubles, then restore
  result = result.replace(/---/g, PLACEHOLDER);
  result = result.replace(/-{2}/g, "-"); // Collapse all double hyphens
  result = result.replace(new RegExp(PLACEHOLDER, 'g'), "---"); // Restore triple hyphens
  // Trim leading/trailing hyphens
  result = result.replace(/^-|-$/g, "");
  
  return result;
}

/**
 * Format date parts for the slug: day name, day number, month.
 * Matches OLT_dateSlugParts_ from prior-implementation.js
 * Uses "d" (not "dd") for day number to avoid leading zeros
 */
function dateSlugParts(dateObj, tz = DEFAULT_TZ) {
  const dt = new Date(dateObj);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long", // "EEEE" -> full weekday name
    day: "numeric", // "d" -> day number without leading zero
    month: "long", // "MMMM" -> full month name
  });
  const parts = formatter.formatToParts(dt);
  const dayName = parts.find((p) => p.type === "weekday")?.value?.toLowerCase() ?? "saturday";
  const dayNum = parts.find((p) => p.type === "day")?.value ?? "4";
  const month = parts.find((p) => p.type === "month")?.value?.toLowerCase() ?? "july";
  return { dayName, dayNum, month };
}

/**
 * Format time for the slug: "12:00-pm"
 * Matches OLT_timeSlug_ from prior-implementation.js
 */
function formatTimeSlug(dateObj, tz = DEFAULT_TZ) {
  const dt = new Date(dateObj);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const time = formatter.format(dt).toLowerCase(); // "1:00 pm"
  return time.replace(" ", "-"); // "1:00-pm" (single space replacement)
}

/**
 * Build OLT event URL from TE API event object.
 *
 * @param {Object} event - TE API event (from GET /v9/events/:id)
 * @param {string} event.name - Event title
 * @param {string} event.occurs_at - ISO datetime
 * @param {number} event.id - te_event_id
 * @param {Object} [event.venue] - { city, state_code|state, name }
 * @param {Object} [event.category] - { short_name|slug|name }
 * @param {Object} [event.taxonomy] - fallback for category
 * @param {string} [event.timezone] - e.g. "America/Chicago"
 * @param {string} [baseUrl] - Override base URL
 * @param {number} [quantity=0] - Query param quantity
 * @returns {string} Full OLT event URL
 */
function buildOltEventUrl(event, baseUrl = OLT_BASE_URL, quantity = 0) {
  const e = event.event || event; // TE API may wrap in { event: {...} }
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

  const cat =
    (e.category && (e.category.short_name || e.category.slug || e.category.name)) ||
    (e.taxonomy && (e.taxonomy.short_name || e.taxonomy.slug || e.taxonomy.name)) ||
    "";
  const catSlug = slugify(cat);

  // <event>-tickets_<city>-<state>_<venue>_<day>-<dd>-<month>-at-<time>_<cat>
  const slug =
    `${nameSlug}-tickets` +
    `_${citySlug}-${stateSlug}` +
    `_${venueSlug}` +
    `_${dayName}-${dayNum}-${month}-at-${timeSlug}` +
    (catSlug ? `_${catSlug}` : "");

  const eventId = e.id;
  const qs = `listingsType=event&orderListBy=retail_price%20asc&quantity=${quantity}`;

  return `${base}/events/${slug}/${eventId}?${qs}`;
}

module.exports = { buildOltEventUrl, slugify, dateSlugParts, formatTimeSlug, OLT_BASE_URL };
