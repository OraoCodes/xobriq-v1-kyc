import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCreditInfoSignal } from "../src/infrastructure/providers/peleza/parser.js";
import { PelezaProvider, type PelezaTokenSource } from "../src/infrastructure/providers/peleza/peleza-provider.js";
import type { PelezaCreditInfoEnvelope } from "../src/infrastructure/providers/peleza/types.js";
import { creditFeatures } from "../src/application/feature-mapping.js";
import { getEngineConfig } from "../src/infrastructure/config/engine-config.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../src/infrastructure/providers/peleza/fixtures/credit-info-sample.json", import.meta.url),
);

function loadFixture(): PelezaCreditInfoEnvelope {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as PelezaCreditInfoEnvelope;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fakeTokenSource: PelezaTokenSource = {
  getToken: async () => "fake-token",
  baseUrl: "https://sandbox.peleza.com",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("parseCreditInfoSignal — envelope parsing", () => {
  it("parses the documented success shape into a valid CreditSignal, safely converting numeric strings", () => {
    const signal = parseCreditInfoSignal(loadFixture());

    expect(signal).not.toBeNull();
    expect(signal?.open_applications).toBe(2); // account_summary.active_accounts
    expect(signal?.worst_days_in_arrears).toBe(30); // max(highest_days_in_arrears) across account_info
    expect(signal?.overdue_ratio).toBeCloseTo(1139.08 / 11390.8, 5);
    expect(signal?.report_status).toBe("found");
    expect(signal?.inquiries_3m).toBe(3); // enquiries.last_3_months
    expect(signal?.applications_3m).toBe(3); // credit_applications.last_3_months
    expect(signal?.has_fraud).toBe(false);
  });

  it("never fabricates inquiries_7d / distinct_recent_inquirers — Peleza has no 7-day bucket", () => {
    const signal = parseCreditInfoSignal(loadFixture());
    expect(signal?.inquiries_7d).toBeUndefined();
    expect(signal?.distinct_recent_inquirers).toBeUndefined();
  });

  it("treats zero total_accounts as thin_file, not found", () => {
    const envelope = loadFixture();
    envelope.data!.account_summary.total_accounts = 0;
    expect(parseCreditInfoSignal(envelope)?.report_status).toBe("thin_file");
  });

  it("treats a zero total_outstanding_balance as a zero overdue_ratio, not a division error", () => {
    const envelope = loadFixture();
    envelope.data!.account_summary.total_outstanding_balance = "0.00";
    envelope.data!.account_summary.total_overdue_balance = "0.00";
    expect(parseCreditInfoSignal(envelope)?.overdue_ratio).toBe(0);
  });

  it("treats a null/empty account_info as zero worst_days_in_arrears, not a crash", () => {
    const envelope = loadFixture();
    envelope.data!.account_info = null;
    expect(parseCreditInfoSignal(envelope)?.worst_days_in_arrears).toBe(0);
  });

  it("parses a malformed numeric string as 0 rather than propagating NaN", () => {
    const envelope = loadFixture();
    envelope.data!.account_summary.total_outstanding_balance = "not-a-number";
    envelope.data!.account_summary.total_overdue_balance = "not-a-number";
    const signal = parseCreditInfoSignal(envelope);
    expect(signal?.overdue_ratio).toBe(0);
    expect(Number.isNaN(signal?.overdue_ratio)).toBe(false);
  });

  it("returns null when the envelope reports success: false", () => {
    const envelope = loadFixture();
    envelope.success = false;
    expect(parseCreditInfoSignal(envelope)).toBeNull();
  });

  it("returns null when data is missing", () => {
    const envelope = loadFixture();
    envelope.data = null;
    expect(parseCreditInfoSignal(envelope)).toBeNull();
  });
});

describe("PelezaProvider.getCredit — credit-info lookup (mocked fetch)", () => {
  it("calls the documented endpoint and returns a success ProviderResult with the parsed signal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getCredit("10000004");

    expect(result.status).toBe("success");
    expect(result.data?.applications_3m).toBe(3);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.peleza.com/api/v1/credit-info");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    expect(JSON.parse(init.body as string)).toEqual({ identity_number: "10000004" });
  });

  it("404 maps to not_found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { success: false, message: "not found" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getCredit("00000000");
    expect(result.status).toBe("not_found");
  });

  it("402 (insufficient wallet balance) maps to error, surfaced clearly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(402, { success: false, message: "insufficient wallet balance" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getCredit("10000004");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/wallet/i);
  });

  it("503 with a 'not found' vendor message maps to not_found (documented ambiguity)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { success: false, message: "Identity not found" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getCredit("00000000");
    expect(result.status).toBe("not_found");
  });

  it("503 with a generic/service-down vendor message maps to error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { success: false, message: "Service temporarily unavailable" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getCredit("10000004");
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unavailable/i);
  });

  it("400/401/429 degrade to error without throwing", async () => {
    const provider = new PelezaProvider(fakeTokenSource);
    for (const status of [400, 401, 429]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
      const result = await provider.getCredit("10000004");
      expect(result.status).toBe("error");
      expect(result.data).toBeNull();
    }
  });

  it("a hanging request times out as a typed ProviderResult, never an unhandled rejection", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );
    const provider = new PelezaProvider(fakeTokenSource);

    const resultPromise = provider.getCredit("10000004");
    // credit-info's own timeout is 15s (longer than the 8s shared default —
    // see peleza-provider.ts's CREDIT_INFO_REQUEST_TIMEOUT_MS).
    await vi.advanceTimersByTimeAsync(16_000);
    const result = await resultPromise;

    expect(result.status).toBe("timeout");
  });

  it("a network error degrades to error, never throws into the caller", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const provider = new PelezaProvider(fakeTokenSource);

    await expect(provider.getCredit("10000004")).resolves.toMatchObject({ status: "error", data: null });
  });
});

describe("the thesis-case inquiry-burst signal reaches the scorer — behavioral parity across granularities", () => {
  it("Peleza's applications_3m >= 3 fires CREDIT_APPLICATIONS_ELEVATED_3M and increases risk", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const peleza = new PelezaProvider(fakeTokenSource);
    const result = await peleza.getCredit("10000004");
    expect(result.data).not.toBeNull();

    const { scorer } = getEngineConfig();
    const scored = scorer.evaluate(creditFeatures(result.data!));

    expect(scored.contributions.some((c) => c.code === "CREDIT_APPLICATIONS_ELEVATED_3M")).toBe(true);
  });

  it("MockProvider's inquiries_7d >= 3 (persona 10000004) still fires the original CREDIT_INQUIRIES_ELEVATED rule, unchanged", async () => {
    const mock = new MockProvider();
    const result = await mock.getCredit("10000004");
    expect(result.data).not.toBeNull();

    const { scorer } = getEngineConfig();
    const scored = scorer.evaluate(creditFeatures(result.data!));

    expect(scored.contributions.some((c) => c.code === "CREDIT_INQUIRIES_ELEVATED")).toBe(true);
  });
});
