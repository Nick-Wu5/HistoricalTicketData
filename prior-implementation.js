function TE_config_() {
  const props = PropertiesService.getScriptProperties();
  return {
    baseUrl: (
      props.getProperty("TE_BASE_URL") || "https://api.ticketevolution.com/v9"
    ).replace(/\/$/, ""),
    token: props.getProperty("TE_TOKEN"),
    secret: props.getProperty("TE_SECRET"),
  };
}

/**
 * Builds the canonical query string TE expects for signing:
 * - removes empty/null/undefined params
 * - sorts keys alphabetically
 * - URL-encodes keys and values
 * - supports array params: key=a&key=b
 * Returns string WITHOUT leading "?"
 */
function TE_canonicalQuery_(params) {
  const p = params || {};
  const keys = Object.keys(p)
    .filter((k) => p[k] !== "" && p[k] !== null && typeof p[k] !== "undefined")
    .sort();

  const parts = [];
  keys.forEach((k) => {
    const v = p[k];
    if (Array.isArray(v)) {
      v.forEach((x) =>
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`),
      );
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  });

  return parts.join("&");
}

function TE_request_(method, path, params, body) {
  const cfg = TE_config_();
  if (!cfg.token || !cfg.secret)
    throw new Error("Missing TE_TOKEN / TE_SECRET in Script Properties.");

  const m = String(method || "GET").toUpperCase();
  const qs = TE_canonicalQuery_(params);

  // Full URL actually requested
  const fullUrl = cfg.baseUrl + path + (qs ? "?" + qs : "");

  // Build the URL-to-sign per TE docs:
  // METHOD + space + (hostname + path + query) with protocol stripped and port stripped.
  // Always include '?' even if query is empty.  [oai_citation:2‡Ticket Evolution](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/983115/Signing%2Brequests%2Bwith%2BX-Signature)
  const urlForSigningBase = (cfg.baseUrl + path)
    .replace(/^https?:\/\//i, "") // strip protocol
    .replace(/:\d+/g, ""); // strip port if present

  let stringToSign;
  const hasBody = body && (m === "POST" || m === "PUT" || m === "DELETE");
  if (hasBody) {
    // For body requests: use ?{json_body}  [oai_citation:3‡Ticket Evolution](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/983115/Signing%2Brequests%2Bwith%2BX-Signature)
    stringToSign = `${m} ${urlForSigningBase}?${JSON.stringify(body)}`;
  } else {
    // For GET: use ?query (or just ? if empty)  [oai_citation:4‡Ticket Evolution](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/983115/Signing%2Brequests%2Bwith%2BX-Signature)
    stringToSign = `${m} ${urlForSigningBase}?${qs}`;
  }

  const rawSig = Utilities.computeHmacSha256Signature(stringToSign, cfg.secret);
  const sig = Utilities.base64Encode(rawSig);

  const options = {
    method: m,
    headers: {
      "X-Token": cfg.token,
      "X-Signature": sig,
      Accept: "application/json",
    },
    muteHttpExceptions: true,
  };

  if (hasBody) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(body);
  }

  const resp = UrlFetchApp.fetch(fullUrl, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(
      `TE API error ${code} on ${path}${qs ? "?" + qs : ""}: ${text}`,
    );
  }

  return JSON.parse(text);
}

function TE_cacheGet_(k) {
  return CacheService.getScriptCache().get(k);
}
function TE_cachePut_(k, v, s) {
  CacheService.getScriptCache().put(k, v, s || 300);
}

function TE_isoDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function TE_parseDateRange_(presetOrStart, maybeEnd) {
  // If user provides two explicit dates, use them.
  if (maybeEnd && String(maybeEnd).trim() !== "")
    return { start: presetOrStart, end: maybeEnd };

  const p = String(presetOrStart || "")
    .trim()
    .toLowerCase();
  const now = new Date();

  function startOfDay(dt) {
    const x = new Date(dt);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(dt, n) {
    const x = new Date(dt);
    x.setDate(x.getDate() + n);
    return x;
  }

  // Monday=1..Sunday=7 (convert JS Sun=0)
  const dow = now.getDay() === 0 ? 7 : now.getDay();

  const monday = addDays(startOfDay(now), -(dow - 1));
  const sunday = addDays(monday, 6);

  function nextFridaySunday(baseDate) {
    const bd = startOfDay(baseDate);
    const bdDow = bd.getDay() === 0 ? 7 : bd.getDay(); // Mon=1..Sun=7
    const daysUntilFri = (5 - bdDow + 7) % 7; // Fri=5
    const fri = addDays(bd, daysUntilFri);
    const sun = addDays(fri, 2);
    const mon = addDays(fri, 3);
    return { fri, sun, mon };
  }

  if (p === "this weekend") {
    const { fri, mon } = nextFridaySunday(now);
    return { start: TE_isoDate_(fri), endExclusive: TE_isoDate_(mon) };
  }

  if (p === "next weekend") {
    const { fri } = nextFridaySunday(now);
    const nextFri = addDays(fri, 7);
    const nextMon = addDays(nextFri, 3);
    return { start: TE_isoDate_(nextFri), endExclusive: TE_isoDate_(nextMon) };
  }

  if (p === "this week")
    return { start: TE_isoDate_(monday), end: TE_isoDate_(sunday) };
  if (p === "next week") {
    const nm = addDays(monday, 7);
    return { start: TE_isoDate_(nm), end: TE_isoDate_(addDays(nm, 6)) };
  }

  if (p === "this month" || p === "next month") {
    const year = now.getFullYear();
    const month = now.getMonth() + (p === "next month" ? 1 : 0);
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { start: TE_isoDate_(first), end: TE_isoDate_(last) };
  }

  // fallback: treat as single explicit start date, end = start
  return { start: presetOrStart, end: presetOrStart };
}

/**
 * =TE_EVENTS(datePresetOrStart, lat, lon, withinMiles, [categoryId], [performerId], [venueId], [minPopularity], [orderBy], [perPage], [page], [endDate], [categoryMode])
 *
 * categoryMode:
 *  - "leaf" (default): passes category_id to API (fast, works for leaf categories like NHL)
 *  - "tree": DOES NOT pass category_id to API; instead filters locally by checking category's parent chain
 */
function TE_EVENTS(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  categoryId,
  performerId,
  venueId,
  minPopularity,
  orderBy,
  perPage,
  page,
  endDate,
  categoryMode,
) {
  if (lat == null || lon == null || withinMiles == null) {
    throw new Error("lat, lon, withinMiles are required.");
  }

  const dr = TE_parseDateRange_(datePresetOrStart, endDate);

  const mode = String(categoryMode || "leaf").toLowerCase(); // "leaf" or "tree"
  const wantCategory = !(categoryId === "" || categoryId == null);

  const desired = Number(perPage || 50); // how many rows we want to return
  const fetchPerPage = 100; // how many events to scan per API page (for tree mode)
  const maxPages = 5; // safety cap (scans up to 500 events)

  // Base params (no category yet)
  const baseParams = {
    "occurs_at.gte": dr.start,
    ...(dr.endExclusive
      ? { "occurs_at.lt": dr.endExclusive }
      : { "occurs_at.lte": dr.end }),
    lat: lat,
    lon: lon,
    within: withinMiles,
    performer_id: performerId || "",
    venue_id: venueId || "",
    "popularity_score.gte":
      minPopularity === "" || minPopularity == null ? "" : minPopularity,
    order_by: orderBy || "events.popularity_score DESC",
  };

  // If leaf mode and category provided, let API filter it directly
  if (wantCategory && mode === "leaf") {
    baseParams["category_id"] = categoryId;
  }

  // Cache key should include mode and categoryId to avoid mixing results
  const cacheKey = TE_cacheKey_("TE_EVENTS_V3", {
    ...baseParams,
    perPage: desired,
    mode: mode,
    categoryId: wantCategory ? String(categoryId) : "",
  });

  // Uncomment to enable caching
  // const cached = TE_cacheGet_(cacheKey);
  // if (cached) return JSON.parse(cached);

  const matched = [];

  // Leaf mode: one call is enough (use requested per_page/page)
  if (mode === "leaf") {
    const params = {
      ...baseParams,
      per_page: desired,
      page: Number(page || 1),
    };

    const data = TE_request_("GET", "/events", params, null);
    const events = data.events || [];

    events.forEach((e) => matched.push(e));
  }

  // Tree mode: scan multiple pages, filter locally by checking category ancestor chain
  if (mode === "tree") {
    for (let p = 1; p <= maxPages; p++) {
      const params = {
        ...baseParams,
        per_page: fetchPerPage,
        page: p,
      };

      const data = TE_request_("GET", "/events", params, null);
      const events = data.events || [];

      if (!events.length) break;

      for (let i = 0; i < events.length; i++) {
        const e = events[i];

        if (wantCategory) {
          const cat = e.category || null;
          if (!cat) continue;
          if (!TE_categoryHasAncestorId_(cat, categoryId)) continue;
        }

        matched.push(e);
        if (matched.length >= desired) break;
      }

      if (matched.length >= desired) break;
    }
  }

  const rows = [
    [
      "event_id",
      "event_name",
      "occurs_at",
      "category",
      "category_id",
      "event_url",
    ],
  ];

  matched.slice(0, desired).forEach((e) => {
    const c = TE_eventCategory_(e);

    rows.push([
      e.id || "",
      e.name || "",
      e.occurs_at || "",
      c.name,
      c.id,
      OLT_eventSeoUrlFromEvent_(e),
    ]);
  });

  // Uncomment to enable caching
  // TE_cachePut_(cacheKey, JSON.stringify(rows), 300);

  return rows;
}

/**
 * =TE_EVENT_STATS(eventId)
 * Always excludes parking via inventory_type=event  [oai_citation:7‡ticketevolution.atlassian.net](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/3057319937/Events%2BStats)
 */
function TE_EVENTS(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  categoryId,
  performerId,
  venueId,
  minPopularity,
  orderBy,
  perPage,
  page,
  endDate,
) {
  if (lat == null || lon == null || withinMiles == null) {
    throw new Error("lat, lon, withinMiles are required.");
  }

  // Date range
  const dr = TE_parseDateRange_(datePresetOrStart, endDate);

  // Build params FIRST (this is what was missing)
  const params = {
    "occurs_at.gte": dr.start,
    ...(dr.endExclusive
      ? { "occurs_at.lt": dr.endExclusive }
      : { "occurs_at.lte": dr.end }),
    lat: lat,
    lon: lon,
    within: withinMiles,
    category_id: categoryId == null || categoryId === "" ? "" : categoryId,
    performer_id: performerId || "",
    venue_id: venueId || "",
    "popularity_score.gte":
      minPopularity == null || minPopularity === "" ? "" : minPopularity,
    order_by: orderBy || "events.popularity_score DESC",
    per_page: perPage || 50,
    page: page || 1,
  };

  // Fetch
  const data = TE_request_("GET", "/events", params, null);
  const events = data.events || [];

  // Output
  const rows = [
    [
      "event_id",
      "event_name",
      "occurs_at",
      "category",
      "category_id",
      "primary_performer_id",
      "event_url",
    ],
  ];

  events.forEach((e) => {
    const c = TE_eventCategory_(e);
    const pid = TE_eventPrimaryPerformerId_(e);

    rows.push([
      e.id || "",
      e.name || "",
      e.occurs_at || "",
      c.name,
      c.id,
      pid,
      OLT_eventSeoUrlFromEvent_(e),
    ]);
  });

  return rows;
}

/**
 * =TE_EVENT_STATS_ROW(eventId)
 * Returns ONE ROW (no headers) so you can fill down a column.
 * Parking excluded via inventory_type=event.
 */
function TE_EVENT_STATS_ROW(eventId) {
  if (!eventId) return [["", "", "", "", "", "", "", "", ""]];

  const cacheKey = TE_cacheKey_("TE_STATS_ROW", { eventId: String(eventId) });
  const cached = TE_cacheGet_(cacheKey);
  if (cached) return JSON.parse(cached);

  // IMPORTANT: no /v9 here because your TE_BASE_URL already includes /v9
  const data = TE_request_(
    "GET",
    `/events/${eventId}/stats`,
    { inventory_type: "event" },
    null,
  );

  const row = [
    [
      data.url || "", // e.g. "/events/982604"  [oai_citation:2‡Ticket Evolution](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/3057319937/Events%2BStats)
      data.state || "", // e.g. "shown" (event state)  [oai_citation:3‡Ticket Evolution](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/3057319937/Events%2BStats)
      data.ticket_groups_count || "",
      data.tickets_count || "",
      data.retail_price_min || "",
      data.retail_price_avg || "",
      data.retail_price_max || "",
      data.retail_price_sum || "",
      data.popularity_score || "",
    ],
  ];

  TE_cachePut_(cacheKey, JSON.stringify(row), 600);
  return row;
}

function OLT_slugify_(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function OLT_timeSlug_(dateObj, tz) {
  // Example target: "1:00-pm" (keep colon like your real URLs)
  const t = Utilities.formatDate(dateObj, tz, "h:mm a").toLowerCase(); // "1:00 pm"
  return t.replace(" ", "-"); // "1:00-pm"
}

function OLT_dateSlugParts_(dateObj, tz) {
  const dayName = Utilities.formatDate(dateObj, tz, "EEEE").toLowerCase(); // sunday
  const dayNum = Utilities.formatDate(dateObj, tz, "d"); // 28
  const month = Utilities.formatDate(dateObj, tz, "MMMM").toLowerCase(); // december
  return { dayName, dayNum, month };
}

/**
 * Builds your full SEO event URL:
 * /events/<event-slug>/<eventId>?listingsType=event&orderListBy=retail_price%20asc&quantity=0
 */
function OLT_eventSeoUrlFromEvent_(e) {
  const props = PropertiesService.getScriptProperties();
  const base = (
    props.getProperty("OLT_BASE_URL") || "https://www.onlylocaltickets.com"
  ).replace(/\/$/, "");

  const v = e.venue || {};
  const tz = e.timezone || Session.getScriptTimeZone();

  // Parse occurs_at (TE often returns ISO8601)
  const dt = new Date(e.occurs_at);

  const nameSlug = OLT_slugify_(e.name);
  const citySlug = OLT_slugify_(v.city);
  const stateSlug = String(v.state_code || v.state || "").toLowerCase();
  const venueSlug = OLT_slugify_(v.name);

  const { dayName, dayNum, month } = OLT_dateSlugParts_(dt, tz);
  const timeSlug = OLT_timeSlug_(dt, tz);

  // Best-effort category tag at the end (e.g., nfl). Adjust mapping as needed.
  const cat =
    (e.category &&
      (e.category.short_name || e.category.slug || e.category.name)) ||
    (e.taxonomy &&
      (e.taxonomy.short_name || e.taxonomy.slug || e.taxonomy.name)) ||
    "";
  const catSlug = OLT_slugify_(cat);

  // Match your observed pattern:
  // <event>-tickets_<city>-<state>_<venue>_<day>-<dd>-<month>-at-<time>_<cat>
  const slug =
    `${nameSlug}-tickets` +
    `_${citySlug}-${stateSlug}` +
    `_${venueSlug}` +
    `_${dayName}-${dayNum}-${month}-at-${timeSlug}` +
    (catSlug ? `_${catSlug}` : "");

  const eventId = e.id;
  const qs = "listingsType=event&orderListBy=retail_price%20asc&quantity=0";

  return `${base}/events/${slug}/${eventId}?${qs}`;
}

function OLT_isBuyableListing_(L) {
  const notes = String(L.public_notes || L.notes || "").toLowerCase();

  // Exclude inventory your UI clearly shouldn’t treat as “starting at”
  const badPhrases = [
    "will be rejected",
    "accepted but not fulfilled",
    "will be accepted but not fulfilled",
    "will remain pending",
    "will be accepted but not fulfilled",
    "not fulfilled",
  ];

  for (let i = 0; i < badPhrases.length; i++) {
    if (notes.indexOf(badPhrases[i]) !== -1) return false;
  }

  return true;
}

/**
 * =TE_EVENT_MIN_PRICE_SITE(eventId, [quantity])
 * Returns "starting at" price that matches OLT behavior (skips rejected/not-fulfilled/pending listings).
 */
function TE_EVENT_MIN_PRICE_SITE(eventId, quantity) {
  if (!eventId) return "";

  const qty = quantity == null || quantity === "" ? 1 : Number(quantity);

  const cacheKey = TE_cacheKey_("TE_MIN_SITE", {
    eventId: String(eventId),
    qty,
  });
  const cached = TE_cacheGet_(cacheKey);
  if (cached) return JSON.parse(cached);

  const params = {
    event_id: eventId,
    type: "event",
    quantity: qty,
    order_by: "retail_price ASC",
  };

  const data = TE_request_("GET", "/listings", params, null);
  const listings = data.ticket_groups || data.listings || [];

  let price = "";
  for (let i = 0; i < listings.length; i++) {
    const L = listings[i];
    if (!OLT_isBuyableListing_(L)) continue;

    if (L.retail_price != null) {
      price = L.retail_price;
      break;
    }
  }

  TE_cachePut_(cacheKey, JSON.stringify(price), 300);
  return price;
}

/**
 * =TE_EVENT_CHEAP_LISTINGS(eventId, [quantity], [limit])
 * Returns the cheapest N listings so we can see why the min is so low.
 */
function TE_EVENT_CHEAP_LISTINGS(eventId, quantity, limit) {
  if (!eventId) return [[""]];

  const qty = quantity == null || quantity === "" ? 1 : Number(quantity);
  const lim = limit == null || limit === "" ? 20 : Number(limit);

  const params = {
    event_id: eventId,
    type: "event",
    quantity: qty,
    order_by: "retail_price ASC",
  };

  const data = TE_request_("GET", "/listings", params, null);
  const listings = data.ticket_groups || data.listings || [];

  const rows = [
    [
      "listing_id",
      "retail_price",
      "wholesale_price",
      "quantity",
      "section",
      "row",
      "format",
      "delivery_type",
      "notes",
      "in_hand_on",
      "owned",
    ],
  ];

  for (let i = 0; i < Math.min(lim, listings.length); i++) {
    const L = listings[i];
    rows.push([
      L.id || "",
      L.retail_price ?? "",
      L.wholesale_price ?? "",
      L.quantity ?? "",
      L.section || "",
      L.row || "",
      L.format || "",
      L.delivery_type || "",
      L.public_notes || L.notes || "",
      L.in_hand_on || "",
      L.owned != null ? L.owned : "",
    ]);
  }

  return rows;
}

function TE_CATEGORY_(categoryId) {
  if (!categoryId) return null;

  const cacheKey = TE_cacheKey_("TE_CATEGORY", {
    categoryId: String(categoryId),
  });
  const cached = TE_cacheGet_(cacheKey);
  if (cached) return JSON.parse(cached);

  const resp = TE_request_("GET", `/categories/${categoryId}`, {}, null);
  const c = resp.category || resp;

  TE_cachePut_(cacheKey, JSON.stringify(c), 3600);
  return c;
}

function TE_eventCategory_(e) {
  // Prefer embedded category object (like TE docs examples)  [oai_citation:1‡ticketevolution.atlassian.net](https://ticketevolution.atlassian.net/wiki/spaces/API/pages/342458638/06.%2BPerformer%2BLanding%2BPages?utm_source=chatgpt.com)
  if (e && e.category && (e.category.name || e.category.id)) {
    return {
      name: e.category.name || e.category.slug || "",
      id: e.category.id || "",
    };
  }

  // Fall back to category_id if present
  const catId = e.category_id || "";
  const c = TE_CATEGORY_(catId) || null;
  return {
    name: (c && (c.name || c.slug)) || "",
    id: (c && c.id) || catId || "",
  };
}

function TE_DEBUG_EVENT_FIELDS_() {
  const data = TE_request_("GET", "/events", { per_page: 1, page: 1 }, null);
  const e = data.events && data.events[0] ? data.events[0] : data;
  Logger.log(JSON.stringify(e, null, 2));
}

function TE_categoryHasAncestor_(catObj, targetId) {
  const tid = String(targetId);
  let c = catObj;
  let guard = 0;
  while (c && guard++ < 10) {
    if (String(c.id) === tid) return true;
    c = c.parent || null;
  }
  return false;
}

function TE_eventPrimaryPerformer_(e) {
  // 1) Most ideal: embedded performers array
  if (Array.isArray(e.performers) && e.performers.length > 0) {
    const p = e.performers[0];
    return { name: p.name || "", id: p.id || "" };
  }

  // 2) Sometimes events include "performances" with embedded performer
  if (Array.isArray(e.performances) && e.performances.length > 0) {
    const perf = e.performances[0];
    const p = perf.performer || perf;
    if (p && (p.id || p.name)) return { name: p.name || "", id: p.id || "" };

    // Or performance may only have performer_id
    if (perf.performer_id) {
      const lookedUp = TE_PERFORMER_(perf.performer_id);
      return {
        name: (lookedUp && lookedUp.name) || "",
        id: (lookedUp && lookedUp.id) || perf.performer_id,
      };
    }
  }

  // 3) Common: primary_performer_id only
  const pid =
    e.primary_performer_id ||
    e.performer_id ||
    (Array.isArray(e.performer_ids) && e.performer_ids[0]) ||
    "";

  if (pid) {
    const lookedUp = TE_PERFORMER_(pid);
    return {
      name: (lookedUp && lookedUp.name) || "",
      id: (lookedUp && lookedUp.id) || pid,
    };
  }

  return { name: "", id: "" };
}

function TE_PERFORMER_(performerId) {
  if (!performerId) return null;

  const cacheKey = TE_cacheKey_("TE_PERFORMER", {
    performerId: String(performerId),
  });
  const cached = TE_cacheGet_(cacheKey);
  if (cached) return JSON.parse(cached);

  const resp = TE_request_("GET", `/performers/${performerId}`, {}, null);
  const p = resp.performer || resp;

  TE_cachePut_(cacheKey, JSON.stringify(p), 3600);
  return p;
}

function TE_eventPrimaryPerformerId_(e) {
  // If performers array exists
  if (
    Array.isArray(e.performers) &&
    e.performers.length > 0 &&
    e.performers[0].id
  ) {
    return e.performers[0].id;
  }

  // Sometimes events include performances
  if (Array.isArray(e.performances) && e.performances.length > 0) {
    const perf = e.performances[0];
    if (perf.performer && perf.performer.id) return perf.performer.id;
    if (perf.performer_id) return perf.performer_id;
  }

  // Common fallbacks
  return (
    e.primary_performer_id ||
    e.performer_id ||
    (Array.isArray(e.performer_ids) ? e.performer_ids[0] : "") ||
    ""
  );

  function TE_PERFORMER_NAME(performerId) {
    if (!performerId) return "";

    const cacheKey = TE_cacheKey_("TE_PERFORMER_NAME", {
      performerId: String(performerId),
    });
    const cached = TE_cacheGet_(cacheKey);
    if (cached) return cached;

    const resp = TE_request_("GET", `/performers/${performerId}`, {}, null);
    const p = resp.performer || resp;
    const name = p && p.name ? p.name : "";

    TE_cachePut_(cacheKey, name, 3600);
    return name;
  }
}

function TE_categoryHasAncestorId_(cat, targetId) {
  const tid = String(targetId);
  let c = cat;
  let guard = 0;

  while (c && guard++ < 10) {
    if (String(c.id) === tid) return true;
    c = c.parent || null;
  }
  return false;
}

function TE_CATEGORY_(categoryId) {
  if (!categoryId) return null;

  const cacheKey = TE_cacheKey_("TE_CATEGORY", {
    categoryId: String(categoryId),
  });
  const cached = TE_cacheGet_(cacheKey);
  if (cached) return JSON.parse(cached);

  const resp = TE_request_("GET", `/categories/${categoryId}`, {}, null);
  const c = resp.category || resp;

  TE_cachePut_(cacheKey, JSON.stringify(c), 6 * 3600); // 6 hours
  return c;
}

function TE_categoryIdIsUnderParent_(leafCategoryId, parentCategoryId) {
  if (!leafCategoryId || !parentCategoryId) return false;

  const tid = String(parentCategoryId);
  let c = TE_CATEGORY_(leafCategoryId);
  let guard = 0;

  while (c && guard++ < 20) {
    if (String(c.id) === tid) return true;
    c = c.parent || null;
  }
  return false;
}

function TE_EVENTS_SPORTS(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  perPage,
  endDate,
) {
  return TE_EVENTS_PARENT_CATEGORY_(
    datePresetOrStart,
    lat,
    lon,
    withinMiles,
    1,
    perPage,
    endDate,
  );
}

function TE_EVENTS_CONCERTS(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  perPage,
  endDate,
) {
  return TE_EVENTS_PARENT_CATEGORY_(
    datePresetOrStart,
    lat,
    lon,
    withinMiles,
    54,
    perPage,
    endDate,
  );
}

function TE_EVENTS_THEATER(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  perPage,
  endDate,
) {
  return TE_EVENTS_PARENT_CATEGORY_(
    datePresetOrStart,
    lat,
    lon,
    withinMiles,
    68,
    perPage,
    endDate,
  );
}

/**
 * Shared implementation for parent-category rollups (Sports/Concerts/Theater).
 * Returns the same columns as TE_EVENTS.
 */
function TE_EVENTS_PARENT_CATEGORY_(
  datePresetOrStart,
  lat,
  lon,
  withinMiles,
  parentCategoryId,
  perPage,
  endDate,
) {
  if (lat == null || lon == null || withinMiles == null) {
    throw new Error("lat, lon, withinMiles are required.");
  }

  const dr = TE_parseDateRange_(datePresetOrStart, endDate);

  const desired = Number(perPage || 50);
  const fetchPerPage = 100;
  const maxPages = 6;

  const baseParams = {
    "occurs_at.gte": dr.start,
    ...(dr.endExclusive
      ? { "occurs_at.lt": dr.endExclusive }
      : { "occurs_at.lte": dr.end }),
    lat: lat,
    lon: lon,
    within: withinMiles,
    order_by: "events.popularity_score DESC",
    per_page: fetchPerPage,
  };

  const matched = [];

  for (let p = 1; p <= maxPages; p++) {
    const params = { ...baseParams, page: p };
    const data = TE_request_("GET", "/events", params, null);
    const events = data.events || [];
    if (!events.length) break;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const leafId = (e.category && e.category.id) || e.category_id || "";
      if (!leafId) continue;

      if (!TE_categoryIdIsUnderParent_(leafId, parentCategoryId)) continue;

      matched.push(e);
      if (matched.length >= desired) break;
    }

    if (matched.length >= desired) break;
  }

  const rows = [
    [
      "event_id",
      "event_name",
      "occurs_at",
      "category",
      "category_id",
      "event_url",
    ],
  ];

  matched.slice(0, desired).forEach((e) => {
    const c = TE_eventCategory_(e);
    rows.push([
      e.id || "",
      e.name || "",
      e.occurs_at || "",
      c.name,
      c.id,
      OLT_eventSeoUrlFromEvent_(e),
    ]);
  });

  return rows;
}

function TE_cacheKey_(prefix, obj) {
  const json = JSON.stringify(obj || {});
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    json,
    Utilities.Charset.UTF_8,
  );
  const hash = Utilities.base64EncodeWebSafe(digest).slice(0, 40);
  return prefix + "_" + hash;
}
