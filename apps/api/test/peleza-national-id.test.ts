import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseNationalIdSignal } from "../src/infrastructure/providers/peleza/parser.js";
import { PelezaProvider, type PelezaTokenSource } from "../src/infrastructure/providers/peleza/peleza-provider.js";
import type { PelezaNationalIdEnvelope } from "../src/infrastructure/providers/peleza/types.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../src/infrastructure/providers/peleza/fixtures/national-id-sample.json", import.meta.url),
);

function loadFixture(): PelezaNationalIdEnvelope {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as PelezaNationalIdEnvelope;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseNationalIdSignal — envelope parsing", () => {
  it("parses the documented success shape into a valid IdentitySignal", () => {
    const signal = parseNationalIdSignal(loadFixture());

    expect(signal).toEqual({
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
    });
  });

  it("never populates date_of_death/pin/biometric fields — this endpoint has no equivalent data", () => {
    const signal = parseNationalIdSignal(loadFixture());
    expect(signal?.date_of_death).toBeUndefined();
    expect(signal?.pin).toBeUndefined();
    expect(signal?.has_photo).toBeUndefined();
    expect(signal?.has_fingerprint).toBeUndefined();
    expect(signal?.has_signature).toBeUndefined();
  });

  it("normalises gender the same way as the Kenya-ID endpoint", () => {
    const envelope = loadFixture();
    envelope.data!.gender = "Male";
    expect(parseNationalIdSignal(envelope)?.gender).toBe("M");
  });

  it("returns null when success is false or data is missing", () => {
    const withoutSuccess = loadFixture();
    withoutSuccess.success = false;
    expect(parseNationalIdSignal(withoutSuccess)).toBeNull();

    const withoutData = loadFixture();
    withoutData.data = null;
    expect(parseNationalIdSignal(withoutData)).toBeNull();
  });
});

describe("PelezaProvider.getIdentity — endpoint routing by environment", () => {
  it("sandbox base URL calls /api/v1/id/ke (unchanged, richer endpoint)", async () => {
    const sandboxTokenSource: PelezaTokenSource = {
      getToken: async () => "fake-token",
      baseUrl: "https://sandbox.peleza.com",
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        response_code: 200,
        message: "ok",
        country: "ke",
        data: {
          id_number: "10000001",
          first_name: "Alice",
          last_name: "Kamau",
          other_name: "Wanjiru",
          full_name: "Alice Wanjiru Kamau",
          gender: "Female",
          date_of_birth: "1990-05-14",
          date_of_death: null,
          citizenship: "Kenyan",
          verification_status: "Valid",
          is_valid: true,
          pin: null,
          has_photo: true,
          has_fingerprint: false,
          has_signature: true,
        },
        request_id: "req_1",
      }),
    );
    const provider = new PelezaProvider(sandboxTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("success");
    expect(result.data?.has_photo).toBe(true); // only /id/ke's shape carries this
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://sandbox.peleza.com/api/v1/id/ke");
  });

  it("a non-sandbox base URL (production) calls /api/v1/national-id", async () => {
    const productionTokenSource: PelezaTokenSource = {
      getToken: async () => "fake-token",
      baseUrl: "https://verify.peleza.com",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, loadFixture()));
    const provider = new PelezaProvider(productionTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("success");
    expect(result.data).toEqual({
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://verify.peleza.com/api/v1/national-id");
    expect(JSON.parse(init.body as string)).toEqual({ id_number: "10000001" });
  });

  it("production routing degrades cleanly on a 500, matching what was observed live", async () => {
    const productionTokenSource: PelezaTokenSource = {
      getToken: async () => "fake-token",
      baseUrl: "https://verify.peleza.com",
    };
    fetchMock.mockResolvedValueOnce(new Response("<html>500</html>", { status: 500, headers: { "Content-Type": "text/html" } }));
    const provider = new PelezaProvider(productionTokenSource);

    const result = await provider.getIdentity("10000001");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });
});
