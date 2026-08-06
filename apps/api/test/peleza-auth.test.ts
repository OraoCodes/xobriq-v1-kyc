import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PelezaAuthClient, PelezaAuthError } from "../src/infrastructure/providers/peleza/auth-client.js";

/** Peleza wraps the token response the same way as every other endpoint — confirmed against a live sandbox call. */
function tokenResponse(accessToken = "tok_abc", expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({
      success: true,
      response_code: 200,
      message: "Token generated successfully",
      data: { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn, scope: "api" },
      request_id: "req_test",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ success: false, response_code: status, data: null, request_id: "req_test", ...body }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.PELEZA_CLIENT_ID = "test-client-id";
  process.env.PELEZA_CLIENT_SECRET = "test-client-secret";
  delete process.env.PELEZA_BASE_URL;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.PELEZA_CLIENT_ID;
  delete process.env.PELEZA_CLIENT_SECRET;
  delete process.env.PELEZA_BASE_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PelezaAuthClient — env config", () => {
  it("throws at construction if PELEZA_CLIENT_ID is missing", () => {
    delete process.env.PELEZA_CLIENT_ID;
    expect(() => new PelezaAuthClient()).toThrow(/PELEZA_CLIENT_ID/);
  });

  it("throws at construction if PELEZA_CLIENT_SECRET is missing", () => {
    delete process.env.PELEZA_CLIENT_SECRET;
    expect(() => new PelezaAuthClient()).toThrow(/PELEZA_CLIENT_SECRET/);
  });

  it("defaults to the sandbox base URL when PELEZA_BASE_URL is unset", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await new PelezaAuthClient().getToken();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://sandbox.peleza.com/api/v1/oauth/token");
  });

  it("uses PELEZA_BASE_URL when explicitly set to the production host", async () => {
    process.env.PELEZA_BASE_URL = "https://verify.peleza.com";
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await new PelezaAuthClient().getToken();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://verify.peleza.com/api/v1/oauth/token");
  });
});

describe("PelezaAuthClient — token lifecycle", () => {
  it("fetches a token and returns the access_token, with the documented request shape", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_123"));

    const token = await new PelezaAuthClient().getToken();

    expect(token).toBe("tok_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.peleza.com/api/v1/oauth/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: "client_credentials",
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    });
  });

  it("caches — a second getToken() within the valid window makes no second HTTP call", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_123"));
    const client = new PelezaAuthClient();

    const first = await client.getToken();
    const second = await client.getToken();

    expect(first).toBe("tok_123");
    expect(second).toBe("tok_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes once inside the expiry buffer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fetchMock.mockResolvedValueOnce(tokenResponse("tok_first", 3600));
    const client = new PelezaAuthClient();
    expect(await client.getToken()).toBe("tok_first");

    // 3570s elapsed of a 3600s token = 30s left, inside the 60s refresh buffer.
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z").getTime() + 3570_000);
    fetchMock.mockResolvedValueOnce(tokenResponse("tok_second", 3600));

    expect(await client.getToken()).toBe("tok_second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT refresh while still outside the buffer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fetchMock.mockResolvedValueOnce(tokenResponse("tok_first", 3600));
    const client = new PelezaAuthClient();
    await client.getToken();

    // Only 10 minutes elapsed of a 1-hour token — well outside the buffer.
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z").getTime() + 600_000);
    expect(await client.getToken()).toBe("tok_first");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-dupes concurrent getToken() calls during a cold fetch into exactly one HTTP call", async () => {
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const client = new PelezaAuthClient();
    const calls = [client.getToken(), client.getToken(), client.getToken()];

    resolveFetch(tokenResponse("tok_shared"));
    const results = await Promise.all(calls);

    expect(results).toEqual(["tok_shared", "tok_shared", "tok_shared"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a fresh getToken() after a failed fetch tries again (in-flight slot correctly cleared)", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, { code: "INVALID_CLIENT" }));
    const client = new PelezaAuthClient();
    await expect(client.getToken()).rejects.toThrow(PelezaAuthError);

    fetchMock.mockResolvedValueOnce(tokenResponse("tok_after_retry"));
    expect(await client.getToken()).toBe("tok_after_retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("PelezaAuthClient — failure classification", () => {
  it("INVALID_CLIENT (401) surfaces as a clear, typed auth error", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, { code: "INVALID_CLIENT", message: "bad credentials" }));
    const client = new PelezaAuthClient();

    const error = await client.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PelezaAuthError);
    expect((error as PelezaAuthError).code).toBe("INVALID_CLIENT");
  });

  it("RATE_LIMIT_EXCEEDED (429) surfaces as a distinct error", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(429, { code: "RATE_LIMIT_EXCEEDED" }));
    const client = new PelezaAuthClient();

    const error = await client.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PelezaAuthError);
    expect((error as PelezaAuthError).code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("an unexpected non-2xx maps to a generic provider error without leaking the body", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(503, { secret_internal_detail: "should never surface" }));
    const client = new PelezaAuthClient();

    const error = await client.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PelezaAuthError);
    expect((error as PelezaAuthError).code).toBe("PROVIDER_ERROR");
    expect(JSON.stringify((error as PelezaAuthError).details)).not.toContain("should never surface");
  });

  it("a network error on the token call surfaces as a typed failure, not an unhandled throw", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const client = new PelezaAuthClient();

    const error = await client.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PelezaAuthError);
    expect((error as PelezaAuthError).code).toBe("NETWORK_ERROR");
  });

  it("a hanging token call times out as a typed failure, not an unhandled rejection", async () => {
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

    const client = new PelezaAuthClient();
    const errorPromise = client.getToken().catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(6_000);

    const error = await errorPromise;
    expect(error).toBeInstanceOf(PelezaAuthError);
    expect((error as PelezaAuthError).code).toBe("TIMEOUT");
  });
});

describe("PelezaAuthClient — no secrets in logs", () => {
  it("never logs the client secret or the access token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fetchMock.mockResolvedValueOnce(tokenResponse("tok_super_secret_value"));
    await new PelezaAuthClient().getToken();

    fetchMock.mockResolvedValueOnce(errorResponse(401, { code: "INVALID_CLIENT" }));
    await new PelezaAuthClient().getToken().catch(() => {});

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg))
      .join(" ");

    expect(allLoggedText).not.toContain("test-client-secret");
    expect(allLoggedText).not.toContain("tok_super_secret_value");
  });
});
