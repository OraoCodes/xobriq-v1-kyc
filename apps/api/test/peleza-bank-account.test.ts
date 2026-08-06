import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseBankAccountSignal } from "../src/infrastructure/providers/peleza/parser.js";
import { PelezaProvider, type PelezaTokenSource } from "../src/infrastructure/providers/peleza/peleza-provider.js";
import type { PelezaBankAccountEnvelope } from "../src/infrastructure/providers/peleza/types.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../src/infrastructure/providers/peleza/fixtures/bank-account-sample.json", import.meta.url),
);

function loadFixture(): PelezaBankAccountEnvelope {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as PelezaBankAccountEnvelope;
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

describe("parseBankAccountSignal — envelope parsing", () => {
  it("extracts the account holder name from the documented success shape", () => {
    expect(parseBankAccountSignal(loadFixture())).toEqual({ bank_account_name: "Alice Wanjiru Kamau" });
  });

  it("does not gate on is_verified — the name is supplied regardless, for the cross-check to judge", () => {
    const envelope = loadFixture();
    envelope.data!.is_verified = false;
    expect(parseBankAccountSignal(envelope)).toEqual({ bank_account_name: "Alice Wanjiru Kamau" });
  });

  it("returns null when success is false", () => {
    const envelope = loadFixture();
    envelope.success = false;
    expect(parseBankAccountSignal(envelope)).toBeNull();
  });

  it("returns null when the account holder name is missing", () => {
    const envelope = loadFixture();
    envelope.data = null;
    expect(parseBankAccountSignal(envelope)).toBeNull();
  });
});

describe("PelezaProvider.getBankAccountName — bank lookup (mocked fetch)", () => {
  it("without a bank_id, returns not_found immediately and never calls fetch", async () => {
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getBankAccountName("10000001");

    expect(result).toEqual({ status: "not_found", data: null, latencyMs: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with a bank_id, calls the documented endpoint and returns the parsed account holder name", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getBankAccountName("10000001", 1);

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ bank_account_name: "Alice Wanjiru Kamau" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.peleza.com/api/v1/bank-account");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    expect(JSON.parse(init.body as string)).toEqual({ account_number: "10000001", bank_id: 1 });
  });

  it("404 maps to not_found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { success: false, message: "not found" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getBankAccountName("00000000", 1);
    expect(result.status).toBe("not_found");
  });

  it("503 with a 'not found' vendor message maps to not_found, not error (documented ambiguity)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { success: false, message: "Bank account not found" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getBankAccountName("00000000", 1);
    expect(result.status).toBe("not_found");
  });

  it("503 with a generic/service-down vendor message maps to error, surfaced clearly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { success: false, message: "Service temporarily unavailable" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getBankAccountName("10000001", 1);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unavailable/i);
  });

  it("400/401/429 degrade to error without throwing", async () => {
    const provider = new PelezaProvider(fakeTokenSource);
    for (const status of [400, 401, 429]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
      const result = await provider.getBankAccountName("10000001", 1);
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

    const resultPromise = provider.getBankAccountName("10000001", 1);
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await resultPromise;

    expect(result.status).toBe("timeout");
  });

  it("a network error during the lookup degrades to error, never throws into the caller", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const provider = new PelezaProvider(fakeTokenSource);

    await expect(provider.getBankAccountName("10000001", 1)).resolves.toMatchObject({ status: "error", data: null });
  });
});
