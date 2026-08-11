import type { IdentityProvider, IdentitySignal, CreditSignal, ProviderResult } from "../../../domain/ports/identity-provider.js";
import { PelezaAuthClient, PelezaAuthError, SANDBOX_BASE_URL } from "./auth-client.js";
import type { PelezaKenyaIdEnvelope, PelezaNationalIdEnvelope, PelezaBankAccountEnvelope, PelezaCreditInfoEnvelope } from "./types.js";
import {
  parseKenyaIdSignal,
  parseNationalIdSignal,
  parseBankAccountSignal,
  parseCreditInfoSignal,
  parseKraEnvelope,
  parseDrivingLicenceEnvelope,
} from "./parser.js";
import { KRA_ENVELOPE_ALICE, DL_ENVELOPE_ALICE } from "./fixtures/alice.js";

const KENYA_ID_PATH = "/api/v1/id/ke";
const NATIONAL_ID_PATH = "/api/v1/national-id";
const BANK_ACCOUNT_PATH = "/api/v1/bank-account";
const CREDIT_INFO_PATH = "/api/v1/credit-info";
const LOOKUP_REQUEST_TIMEOUT_MS = 8_000;

/** The subset of PelezaAuthClient that a lookup adapter needs — lets tests inject a fake without real env vars. */
export interface PelezaTokenSource {
  getToken(): Promise<string>;
  readonly baseUrl: string;
}

const KENYA_ID_ERROR_MESSAGE_BY_STATUS: Partial<Record<number, string>> = {
  400: "Peleza rejected the request — invalid or missing id_number",
  401: "Peleza rejected the request credentials",
  403: "Peleza denied access to this country/service",
  402: "Peleza wallet balance is insufficient — billing action required",
  429: "Peleza rate limit exceeded",
  503: "Peleza Kenya-ID lookup is temporarily unavailable",
};

const BANK_ERROR_MESSAGE_BY_STATUS: Partial<Record<number, string>> = {
  400: "Peleza rejected the bank lookup — invalid or missing account_number/bank_id",
  401: "Peleza rejected the request credentials",
  429: "Peleza rate limit exceeded",
};

// Confirmed against Peleza's documented error table for credit-info:
// E001 invalid identity number (400), E002 invalid identity type (400),
// E003 identity not found (404 — handled generically, see
// ambiguous503ErrorResultFor's 404 branch), E409 duplicate request (409),
// INVALID_TOKEN (401). 402/429 aren't itemized for this endpoint
// specifically but are kept as a defensive fallback (shared wallet/rate-
// limit infra could still surface them).
const CREDIT_ERROR_MESSAGE_BY_STATUS: Partial<Record<number, string>> = {
  400: "Peleza rejected the credit-info request — invalid identity_number or identity_type",
  401: "Peleza rejected the request credentials",
  402: "Peleza wallet balance is insufficient — billing action required",
  409: "Peleza reported a duplicate credit-info request",
  429: "Peleza rate limit exceeded",
};

/**
 * PelezaProvider — getIdentity, getBankAccountName, and getCredit are wired
 * to real Peleza HTTP calls, authenticated via PelezaAuthClient.
 * getKraTaxpayerName/getDrivingLicence still serve the earlier synthetic
 * fixture pipeline (see types.ts) — those wire shapes remain unverified and
 * are wired to real HTTP calls in a later pass.
 *
 * The auth client is constructed lazily (on first use), not in the
 * constructor — `new PelezaProvider()` must never throw just because
 * PELEZA_CLIENT_ID/SECRET aren't configured yet, since it's constructed
 * unconditionally at server startup alongside MockProvider.
 */
export class PelezaProvider implements IdentityProvider {
  private tokenSource: PelezaTokenSource | null;

  constructor(tokenSource?: PelezaTokenSource) {
    this.tokenSource = tokenSource ?? null;
  }

  private getTokenSource(): PelezaTokenSource {
    if (!this.tokenSource) this.tokenSource = new PelezaAuthClient();
    return this.tokenSource;
  }

  private async postJson(path: string, token: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOOKUP_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${this.getTokenSource().baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Shared shape for both lookups' catch blocks — T is a phantom type, the runtime object is identical either way. */
  private degradedResult<T>(label: string, error: unknown, latencyMs: number): ProviderResult<T> {
    if (error instanceof PelezaAuthError) {
      if (error.code === "TIMEOUT") return { status: "timeout", data: null, latencyMs, error: error.message };
      console.error(`peleza ${label} lookup failed: auth error (${error.code})`);
      return { status: "error", data: null, latencyMs, error: `Peleza authentication failed: ${error.code}` };
    }
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "timeout", data: null, latencyMs, error: `Peleza ${label} lookup timed out` };
    }
    console.error(`peleza ${label} lookup failed unexpectedly:`, error instanceof Error ? error.message : String(error));
    return { status: "error", data: null, latencyMs, error: `Peleza ${label} lookup failed unexpectedly` };
  }

  /**
   * `/api/v1/id/ke` is verified working against SANDBOX and is the richer
   * shape (carries date_of_death/pin/biometric flags). `/api/v1/national-id`
   * is a separate endpoint confirmed working against PRODUCTION when
   * `/id/ke` started 500ing there (2026-08-11) — its response has no
   * deceased/pin/biometric fields at all, so identity signals sourced from
   * production currently can't feed the deceased hard-rule. Routing is by
   * base URL: sandbox keeps using the richer, verified endpoint; anything
   * else (production) uses the one actually confirmed to work there. If
   * Peleza ever fixes `/id/ke` in production, this should be revisited.
   */
  async getIdentity(nationalId: string): Promise<ProviderResult<IdentitySignal>> {
    const startedAt = Date.now();
    const isSandbox = this.getTokenSource().baseUrl === SANDBOX_BASE_URL;
    try {
      const token = await this.getTokenSource().getToken();
      const path = isSandbox ? KENYA_ID_PATH : NATIONAL_ID_PATH;
      const response = await this.postJson(path, token, { id_number: nationalId });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        if (response.status === 404) return { status: "not_found", data: null, latencyMs };
        const error = KENYA_ID_ERROR_MESSAGE_BY_STATUS[response.status] ?? `Peleza identity lookup returned ${response.status}`;
        return { status: "error", data: null, latencyMs, error };
      }

      const signal = isSandbox
        ? parseKenyaIdSignal((await response.json()) as PelezaKenyaIdEnvelope)
        : parseNationalIdSignal((await response.json()) as PelezaNationalIdEnvelope);
      if (!signal) return { status: "not_found", data: null, latencyMs };
      return { status: "success", data: signal, latencyMs };
    } catch (error) {
      return this.degradedResult("identity", error, Date.now() - startedAt);
    }
  }

  /**
   * bankId is required by the real endpoint but isn't wired into
   * DecisionRequest yet (a separate later task — no bank selector exists on
   * the request today). Without it there is nothing valid to call, so this
   * returns not_found immediately rather than fabricating a bank_id or
   * firing a guaranteed-to-fail request — functionally identical to the
   * cascade's existing "no account number, skip the bank check" path.
   */
  async getBankAccountName(
    accountNumber: string,
    bankId?: number,
  ): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>> {
    const startedAt = Date.now();
    if (bankId === undefined) {
      return { status: "not_found", data: null, latencyMs: 0 };
    }
    try {
      const token = await this.getTokenSource().getToken();
      const response = await this.postJson(BANK_ACCOUNT_PATH, token, { account_number: accountNumber, bank_id: bankId });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) return await this.ambiguous503ErrorResultFor(response, BANK_ERROR_MESSAGE_BY_STATUS, latencyMs);

      const envelope = (await response.json()) as PelezaBankAccountEnvelope;
      const signal = parseBankAccountSignal(envelope);
      if (!signal) return { status: "not_found", data: null, latencyMs };
      return { status: "success", data: signal, latencyMs };
    } catch (error) {
      return this.degradedResult("bank-account", error, Date.now() - startedAt);
    }
  }

  /**
   * Peleza's documented error tables map BOTH "not found" and "service
   * unavailable" to HTTP 503 on more than one endpoint — the only way to
   * tell them apart is the vendor message in the body, so this reads it
   * best-effort. Also treats a plain 404 as not_found defensively, in case
   * reality (like Kenya-ID's) differs from the docs. Shared by both the bank
   * and credit-info adapters.
   */
  private async ambiguous503ErrorResultFor<T>(
    response: Response,
    errorMessageByStatus: Partial<Record<number, string>>,
    latencyMs: number,
  ): Promise<ProviderResult<T>> {
    if (response.status === 404) return { status: "not_found", data: null, latencyMs };

    if (response.status === 503) {
      const message = await this.safeReadMessage(response);
      if (message && /not[\s_-]?found/i.test(message)) {
        return { status: "not_found", data: null, latencyMs };
      }
      return { status: "error", data: null, latencyMs, error: message ?? "Peleza service unavailable" };
    }

    const error = errorMessageByStatus[response.status] ?? `Peleza lookup returned ${response.status}`;
    return { status: "error", data: null, latencyMs, error };
  }

  private async safeReadMessage(response: Response): Promise<string | undefined> {
    try {
      const body = (await response.json()) as { message?: string };
      return body.message;
    } catch {
      return undefined;
    }
  }

  /**
   * `credit-info` (the rich report), not the thinner `credit-score`, per the
   * documented contract — it carries the enquiry/application-velocity data
   * the thesis-case signal needs. This is a Tier-2 (paid) lookup; the
   * cascade only calls it when confidence is low enough to warrant it — see
   * signal-gatherer.ts's gatherTier2a.
   */
  async getCredit(nationalId: string): Promise<ProviderResult<CreditSignal>> {
    const startedAt = Date.now();
    try {
      const token = await this.getTokenSource().getToken();
      const response = await this.postJson(CREDIT_INFO_PATH, token, { identity_number: nationalId });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) return await this.ambiguous503ErrorResultFor(response, CREDIT_ERROR_MESSAGE_BY_STATUS, latencyMs);

      const envelope = (await response.json()) as PelezaCreditInfoEnvelope;
      const signal = parseCreditInfoSignal(envelope);
      if (!signal) return { status: "not_found", data: null, latencyMs };
      return { status: "success", data: signal, latencyMs };
    } catch (error) {
      return this.degradedResult("credit-info", error, Date.now() - startedAt);
    }
  }

  async getKraTaxpayerName(_kraPin: string): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>> {
    // Live call slots in here: POST /v2/kra/verify { kra_pin }
    return parseKraEnvelope(KRA_ENVELOPE_ALICE);
  }

  async getDrivingLicence(_nationalId: string): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>> {
    // Live call slots in here: POST /v2/driving-licence/verify { id_number }
    return parseDrivingLicenceEnvelope(DL_ENVELOPE_ALICE);
  }
}
