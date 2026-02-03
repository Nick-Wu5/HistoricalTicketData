import { crypto } from "jsr:@std/crypto@1.0.5";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

/**
 * Ticket Evolution API Client for Deno
 */
export class TicketEvolutionClient {
  private apiToken: string;
  private apiSecret: string;
  private baseUrl = "https://api.sandbox.ticketevolution.com/v9";

  constructor(token: string, secret: string) {
    this.apiToken = token;
    this.apiSecret = secret;
  }

  /**
   * Generates HMAC-SHA256 signature for the request
   */
  private async generateSignature(
    method: string,
    path: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    // Sort parameters alphabetically by key
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, string> = {};
    sortedKeys.forEach((key) => {
      sortedParams[key] = params[key];
    });

    // Valid query string must ALWAYS start with ?
    const queryString = Object.keys(sortedParams).length > 0
      ? "?" + new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
      : "?";

    // Construct the full string to sign
    // Format: METHOD hostname path?query
    // parse the baseUrl to get hostname
    const url = new URL(this.baseUrl);
    const hostname = url.hostname; // api.sandbox.ticketevolution.com

    // path here is typically "/v9/events" (passed from get())
    // ensure it starts with /
    const cleanPath = path.startsWith("/") ? path : "/" + path;

    const message = `${method} ${hostname}${cleanPath}${queryString}`;
    console.log(`TE API Signing: ${message}`); // Log for debugging in edge function logs

    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.apiSecret);
    const messageData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign("HMAC", key, messageData);
    return encodeBase64(signature);
  }

  /**
   * Performs a GET request to the TE API
   */
  async get(endpoint: string, params: Record<string, string> = {}) {
    // Ensure endpoint starts with /
    const endpointPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    // Extract version from baseUrl (e.g. /v9)
    const urlObj = new URL(this.baseUrl);
    const versionPrefix = urlObj.pathname.replace(/\/$/, ""); // Remove trailing slash

    // Full path for signature must include version (e.g. /v9/events)
    const fullPath = `${versionPrefix}${endpointPath}`;

    const signature = await this.generateSignature("GET", fullPath, params);

    const requestUrl = new URL(`${this.baseUrl}${endpointPath}`);
    Object.entries(params).forEach(([key, value]) => {
      requestUrl.searchParams.append(key, value);
    });

    const headers = {
      "X-Token": this.apiToken,
      "X-Signature": signature,
      "Accept": "application/json",
    };

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TE API Error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return await response.json();
  }
}
