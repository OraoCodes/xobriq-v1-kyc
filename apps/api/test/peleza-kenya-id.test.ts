import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseKenyaIdSignal } from "../src/infrastructure/providers/peleza/parser.js";
import { PelezaProvider, type PelezaTokenSource } from "../src/infrastructure/providers/peleza/peleza-provider.js";
import type { PelezaKenyaIdEnvelope } from "../src/infrastructure/providers/peleza/types.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../src/infrastructure/providers/peleza/fixtures/kenya-id-sample.json", import.meta.url),
);

function loadFixture(): PelezaKenyaIdEnvelope {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as PelezaKenyaIdEnvelope;
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

describe("parseKenyaIdSignal — real envelope parsing", () => {
  it("parses the documented success shape into a valid IdentitySignal", () => {
    const signal = parseKenyaIdSignal(loadFixture());

    expect(signal).toEqual({
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
      date_of_death: null,
      pin: "A100284531Z",
      has_photo: true,
      has_fingerprint: false,
      has_signature: true,
    });
  });

  it("captures a non-null date_of_death — the deceased hard-rule signal", () => {
    const envelope = loadFixture();
    envelope.data!.date_of_death = "2020-01-01";
    expect(parseKenyaIdSignal(envelope)?.date_of_death).toBe("2020-01-01");
  });

  it("normalises gender case-insensitively and unmatched values to null", () => {
    const envelope = loadFixture();
    envelope.data!.gender = "Male";
    expect(parseKenyaIdSignal(envelope)?.gender).toBe("M");

    envelope.data!.gender = "unknown";
    expect(parseKenyaIdSignal(envelope)?.gender).toBeNull();
  });

  it("returns null when the envelope reports success: false", () => {
    const envelope = loadFixture();
    envelope.success = false;
    expect(parseKenyaIdSignal(envelope)).toBeNull();
  });

  it("returns null when data is missing even though success is true", () => {
    const envelope = loadFixture();
    envelope.data = null;
    expect(parseKenyaIdSignal(envelope)).toBeNull();
  });
});

describe("PelezaProvider.getIdentity — Kenya-ID lookup (mocked fetch)", () => {
  it("returns a success ProviderResult with the parsed signal, calling the documented endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("success");
    expect(result.data).toEqual({
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
      date_of_death: null,
      pin: "A100284531Z",
      has_photo: true,
      has_fingerprint: false,
      has_signature: true,
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.peleza.com/api/v1/id/ke");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    expect(JSON.parse(init.body as string)).toEqual({ id_number: "10000001" });
  });

  it("404 maps to not_found, not error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { success: false, message: "not found" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getIdentity("00000000");

    expect(result.status).toBe("not_found");
    expect(result.data).toBeNull();
  });

  it("402 (insufficient wallet balance) maps to error, surfaced clearly and distinctly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(402, { success: false, message: "insufficient wallet balance" }));
    const provider = new PelezaProvider(fakeTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/wallet/i);
  });

  it("429/503/401/403/400 all degrade to error without throwing", async () => {
    const provider = new PelezaProvider(fakeTokenSource);
    for (const status of [400, 401, 403, 429, 503]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
      const result = await provider.getIdentity("10000001");
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

    const resultPromise = provider.getIdentity("10000001");
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await resultPromise;

    expect(result.status).toBe("timeout");
  });

  it("a network error during the lookup degrades to error, never throws into the caller", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const provider = new PelezaProvider(fakeTokenSource);

    await expect(provider.getIdentity("10000001")).resolves.toMatchObject({ status: "error", data: null });
  });

  it("a token-fetch failure (bad credentials) degrades to error, never throws into the caller", async () => {
    const failingTokenSource: PelezaTokenSource = {
      getToken: async () => {
        const { PelezaAuthError } = await import("../src/infrastructure/providers/peleza/auth-client.js");
        throw new PelezaAuthError("INVALID_CLIENT", "bad credentials");
      },
      baseUrl: "https://sandbox.peleza.com",
    };
    const provider = new PelezaProvider(failingTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("parity — Kenya-ID and MockProvider yield the same IdentitySignal shape and values for the clean persona", () => {
  it("agrees field-for-field with MockProvider's persona 10000001", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const peleza = new PelezaProvider(fakeTokenSource);
    const mock = new MockProvider();

    const fromPeleza = await peleza.getIdentity("10000001");
    const fromMock = await mock.getIdentity("10000001");

    expect(fromPeleza.status).toBe("success");
    expect(fromMock.status).toBe("success");
    expect(fromPeleza.data?.id_valid).toBe(fromMock.data?.id_valid);
    expect(fromPeleza.data?.full_name).toBe(fromMock.data?.full_name);
    expect(fromPeleza.data?.dob).toBe(fromMock.data?.dob);
    expect(fromPeleza.data?.gender).toBe(fromMock.data?.gender);
  });
});
