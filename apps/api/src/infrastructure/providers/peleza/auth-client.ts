/**
 * Peleza OAuth 2.0 client-credentials auth — grounded in Peleza's real,
 * verified auth docs (unlike the lookup-envelope shapes elsewhere in this
 * folder, which are modeled/unverified pending the live API reference).
 *
 * Every lookup adapter (Kenya ID, bank, KRA, driving licence, credit —
 * built in follow-up prompts) sits on top of `PelezaAuthClient.getToken()`
 * for its bearer credential. This file owns the token lifecycle only.
 */

export const SANDBOX_BASE_URL = "https://sandbox.peleza.com";
const TOKEN_PATH = "/api/v1/oauth/token";

/** Refresh proactively once within this many ms of expiry — never hand out a token about to die mid-request. */
const REFRESH_BUFFER_MS = 60_000;
/** A hanging token call must not hang a decision. */
const TOKEN_REQUEST_TIMEOUT_MS = 5_000;

export type PelezaAuthErrorCode =
  | "INVALID_CLIENT" // 401 — bad client_id/client_secret; an operator/config problem, surface loudly
  | "RATE_LIMIT_EXCEEDED" // 429 — back off
  | "INVALID_SCOPE" // 400 — per Peleza's docs table
  | "TIMEOUT" // our own bound on the token call, not a Peleza-documented code
  | "NETWORK_ERROR" // fetch itself failed — DNS, connection refused, etc.
  | "PROVIDER_ERROR"; // unexpected non-2xx; never leaks the response body

/**
 * A dedicated error type rather than reusing the app-wide `AppError` — that
 * union is the taxonomy for OUR HTTP edge's responses to OUR callers, not a
 * good fit for classifying failures from an upstream vendor's own auth
 * endpoint. Callers (the lookup adapters, later) catch this and decide how
 * to degrade — same discipline as `Result`, expressed as a typed rejection
 * because `getToken()`'s contract is a plain `Promise<string>`.
 */
export class PelezaAuthError extends Error {
  constructor(
    readonly code: PelezaAuthErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PelezaAuthError";
  }
}

/**
 * Peleza wraps every response — including the token endpoint's — in the same
 * {success, response_code, message, data, request_id} envelope. Confirmed
 * against a live sandbox call: the token itself is at `data.access_token`,
 * not at the top level.
 */
export interface PelezaTokenResponse {
  success: boolean;
  response_code: number;
  message: string;
  data: {
    access_token: string;
    token_type: "Bearer";
    expires_in: number; // seconds
    scope: string;
  } | null;
  request_id: string;
}

const STATUS_TO_CODE: Partial<Record<number, PelezaAuthErrorCode>> = {
  400: "INVALID_SCOPE",
  401: "INVALID_CLIENT",
  429: "RATE_LIMIT_EXCEEDED",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Owns Peleza authentication and hands lookup adapters a valid bearer token
 * on demand. Caches in memory, refreshes proactively before expiry, and
 * de-duplicates concurrent refreshes into a single HTTP call — Peleza's own
 * docs recommend exactly this to minimise calls to the token endpoint.
 */
export class PelezaAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  readonly baseUrl: string;
  private cachedToken: CachedToken | null = null;
  private inFlight: Promise<string> | null = null;

  constructor() {
    this.clientId = requireEnv("PELEZA_CLIENT_ID");
    this.clientSecret = requireEnv("PELEZA_CLIENT_SECRET");
    // Sandbox by default so we never accidentally hit production in dev —
    // production only when this is explicitly the prod host.
    this.baseUrl = (process.env.PELEZA_BASE_URL || SANDBOX_BASE_URL).replace(/\/+$/, "");
  }

  async getToken(): Promise<string> {
    const cached = this.cachedToken;
    if (cached && cached.expiresAt - REFRESH_BUFFER_MS > Date.now()) {
      return cached.accessToken;
    }

    // Concurrent callers during a cold fetch share this one in-flight
    // promise instead of each firing their own request at the token endpoint.
    if (!this.inFlight) {
      this.inFlight = this.fetchNewToken().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async fetchNewToken(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${TOKEN_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("peleza token fetch failed: TIMEOUT");
        throw new PelezaAuthError("TIMEOUT", "Peleza token request timed out");
      }
      console.error("peleza token fetch failed: NETWORK_ERROR");
      throw new PelezaAuthError("NETWORK_ERROR", "Peleza token request failed", {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw await this.errorFor(response);
    }

    const body = (await response.json()) as PelezaTokenResponse;
    if (!body.success || !body.data) {
      console.error("peleza token fetch failed: PROVIDER_ERROR (200 with success: false)");
      throw new PelezaAuthError("PROVIDER_ERROR", "Peleza token endpoint returned success: false", { responseCode: body.response_code });
    }

    this.cachedToken = { accessToken: body.data.access_token, expiresAt: Date.now() + body.data.expires_in * 1000 };
    console.log("peleza token refreshed");
    return body.data.access_token;
  }

  private async errorFor(response: Response): Promise<PelezaAuthError> {
    const code = STATUS_TO_CODE[response.status] ?? "PROVIDER_ERROR";

    if (code === "PROVIDER_ERROR") {
      // Unexpected non-2xx — classified generically, body never included.
      console.error(`peleza token fetch failed: PROVIDER_ERROR (${response.status})`);
      return new PelezaAuthError("PROVIDER_ERROR", `Peleza token endpoint returned ${response.status}`, { status: response.status });
    }

    // A known case — try to enrich with the vendor's own error message, but a
    // body-parse failure never hides the already-known classification.
    let vendorDetail: { vendorCode: number | undefined; vendorMessage: string | undefined } | undefined;
    try {
      const body = (await response.json()) as { response_code?: number; message?: string };
      vendorDetail = { vendorCode: body.response_code, vendorMessage: body.message };
    } catch {
      vendorDetail = undefined;
    }

    console.error(`peleza token fetch failed: ${code}`);
    const message =
      code === "INVALID_CLIENT"
        ? "Peleza rejected the client credentials — check PELEZA_CLIENT_ID/PELEZA_CLIENT_SECRET"
        : code === "RATE_LIMIT_EXCEEDED"
          ? "Peleza token endpoint rate-limited this request"
          : "Peleza rejected the requested token scope";
    return new PelezaAuthError(code, message, vendorDetail);
  }
}
