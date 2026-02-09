import { crypto } from "jsr:@std/crypto@1.0.5";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

/**
 * Ticket Evolution API client for Deno.
 * Uses HMAC-SHA256 signed requests (X-Token, X-Signature).
 * Base URL: sandbox by default; switch for production.
 */
export class TicketEvolutionClient {
  private apiToken: string;
  private apiSecret: string;
  /** Sandbox: api.sandbox.ticketevolution.com; Production: api.ticketevolution.com */
  private baseUrl = "https://api.sandbox.ticketevolution.com/v9";

  constructor(token: string, secret: string) {
    this.apiToken = token;
    this.apiSecret = secret;
  }

  /**
   * Build HMAC-SHA256 signature for the request.
   * TE expects: METHOD hostname path?query (params sorted alphabetically).
   */
  private async generateSignature(
    method: string,
    path: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, string> = {};
    for (const key of sortedKeys) sortedParams[key] = params[key];

    const queryString =
      sortedKeys.length > 0
        ? "?" +
          new URLSearchParams(sortedParams).toString().replace(/\+/g, "%20")
        : "?";

    const baseUrlObj = new URL(this.baseUrl);
    const hostname = baseUrlObj.hostname;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const stringToSign = `${method} ${hostname}${normalizedPath}${queryString}`;

    console.log(`TE API Signing: ${stringToSign}`);

    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(this.apiSecret);
    const messageBytes = encoder.encode(stringToSign);

    const hmacKey = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      messageBytes,
    );
    return encodeBase64(signatureBytes);
  }

  /**
   * GET request to TE API. Signs request with HMAC-SHA256.
   */
  async get(endpoint: string, params: Record<string, string> = {}) {
    const endpointPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const baseUrlObj = new URL(this.baseUrl);
    const versionPrefix = baseUrlObj.pathname.replace(/\/$/, "");
    const fullPathForSignature = `${versionPrefix}${endpointPath}`;

    const signature = await this.generateSignature(
      "GET",
      fullPathForSignature,
      params,
    );

    const requestUrl = new URL(`${this.baseUrl}${endpointPath}`);
    for (const [key, value] of Object.entries(params)) {
      requestUrl.searchParams.append(key, value);
    }

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: {
        "X-Token": this.apiToken,
        "X-Signature": signature,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `TE API Error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    return await response.json();
  }
}
