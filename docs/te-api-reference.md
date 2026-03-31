# Ticket Evolution API Reference (The "What Actually Works" Guide)

> **⚠️ WARNING**: Use this guide instead of guessing. The official documentation can be misleading regarding endpoints and signature generation.

## Overview

The Exchange API is organized around REST with predictable resource-oriented URLs. It accepts JSON request bodies, returns JSON-encoded responses, and uses standard HTTP response codes and verbs.

---

## Environments

| Environment | API URL |
|-------------|---------|
| **Sandbox** | `https://api.sandbox.ticketevolution.com` |
| **Production** | `https://api.ticketevolution.com` |

Sandbox is completely isolated from Production but shares the same Events, Performers, Venues, and Configurations. See the "Valid Test Data" section below for sandbox-specific guidance.

---

## Authentication & Credentials

Authentication is based on API Tokens plus a shared secret used to compute a required `X-Signature` header.

| Credential Type | Description | Required Headers |
|-----------------|-------------|------------------|
| **Upload Credential** | Used only to upload inventory (Auto Uploader or special API endpoint). | `X-Token` |
| **API Credential** | Typical credential acting on behalf of a Brokerage. | `X-Token`, `X-Signature` |
| **User Credential** | Acts on behalf of a specific User; needed for certain endpoints. | `X-Token`, `X-Signature` |

### The Signature Rule
Every API/User credential request requires an `X-Signature` header generated via HMAC-SHA256.

**Critical Quirks:**
1. **Hostname is required**: You must include `api.ticketevolution.com` (or sandbox) in the string to sign.
2. **The Question Mark Rule**: The query string part **MUST** start with `?`, even if there are **ZERO parameters**.
   - Incorrect: `GET api.sandbox.ticketevolution.com/v9/events`
   - Correct: `GET api.sandbox.ticketevolution.com/v9/events?`
3. **Paths**: The path in the signature must include the version prefix (e.g., `/v9/events`).

**Correct Signature Construction (JavaScript/TypeScript):**
```typescript
// 1. Sort params
const sortedParams = sortObjectKeys(params);
// 2. Construct Query String (ALWAYS START WITH ?)
const queryString = Object.keys(sortedParams).length > 0 
    ? '?' + new URLSearchParams(sortedParams).toString() 
    : '?'; // <--- CRITICAL!

// 3. String to sign
const stringToSign = `${method} ${hostname}${path}${queryString}`;
// Example: "GET api.sandbox.ticketevolution.com/v9/events?"
```

---

## Pagination

Most list endpoints support pagination via two query parameters:

| Parameter | Default | Maximum | Description |
|-----------|---------|---------|-------------|
| `per_page` | **100** | **100** | Number of results per page. |
| `page` | **1** | — | Which page of results to return. |

> **Important**: The default *and* maximum `per_page` is **100**. If a query matches more than 100 results you **must** paginate through additional pages to get them all.

---

## Conditionals (Date Filtering)

Most endpoints that accept date parameters (`updated_at`, `occurs_at`, `deleted_at`, etc.) support these suffixes for range queries:

| Suffix | Meaning |
|--------|---------|
| `.eq` | equal (case-sensitive) |
| `.not_eq` | not equal (case-sensitive) |
| `.gt` | greater than |
| `.gte` | greater than or equal |
| `.lt` | less than |
| `.lte` | less than or equal |

**Example** — events occurring between May 15 and May 20, 2023:
```
/v9/events?occurs_at.gte=2023-05-15&occurs_at.lt=2023-05-20
```

---

## Key Endpoints

### 1. Events Index (Get All)
- **Endpoint**: `/v9/events`
- **Params**: `page`, `per_page`, `q` (search), plus date conditionals
- **Status**: Works perfectly with pagination (max 100 per page).

### 2. Listings for an Event (The Tricky One)
There are two ways documented, but **only one works reliably**.

❌ **AVOID**: `/v9/events/:id/listings`
- **Status**: Returns `404 Not Found` in Sandbox for many events.
- **Why**: Seems deprecated or broken for Sandbox test events.

✅ **USE**: `/v9/listings`
- **Params**: `event_id` (Required)
- **Pagination**: **NOT SUPPORTED**. Returns `400 Bad Request` if you pass `page` or `per_page`.
- **Response Key**: `ticket_groups` (Use this! Sometimes documented as `listings` but `ticket_groups` is safer).
- **Status**: ✅ Works. Returns all active listings at once.

**Example Request**:
```
GET /v9/listings?event_id=982605
```

---

## 📦 Data Models

### Listing / Ticket Group Object
The API returns an array of objects under `ticket_groups`. Key properties:

| Property | Type | Description |
|----------|------|-------------|
| `retail_price` | float | **PRIMARY PRICE**. The price to the customer. Use this for aggregation. |
| `wholesale_price`| float | The cost to the broker. **IGNORE** this for consumer facing stats. |
| `quantity` | int | Total tickets in this group. |
| `splits` | array | Helper array for dropdowns (e.g. `[1, 2, 4]`). |
| `type` | string | usually `event` or `parking`. Filter out non-event types! |
| `format` | string | `Eticket`, `Physical`, `TM_mobile`, etc. |

---

## 🧪 Valid Test Data (Sandbox)

The Sandbox environment is mostly empty, EXCEPT for specific auto-generated events.

**Official Test Event:**
- **ID**: `982605`
- **Name**: "Test Event (Test Purchases Only)"
- **Behavior**: Inventory is auto-replenished nightly.

**Do NOT** blindly scan for events; 99% of them have 0 listings. Always test against `982605`.

---

## 🐛 Debugging Tips

1. **401 Unauthorized**: almost certainly your signature string construction. Did you forget the `?`? Did you include the hostname?
2. **404 Not Found**: You are likely using `/events/:id/listings`. Switch to `/listings?event_id=:id`.
3. **400 Bad Request**: You probably sent `per_page` to the listings endpoint. Remove it.
4. **"No Data"**: Check if `retail_price` exists on the items. Use `utils.ts` fallback logic.
