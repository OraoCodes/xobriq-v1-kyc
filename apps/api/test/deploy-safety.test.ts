import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/interfaces/http/app.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

/**
 * Deploy-safety checks for the production redeploy: a mock-only demo
 * environment (no Peleza credentials configured) must boot cleanly and stay
 * fully self-contained — zero outbound calls — end to end through the real
 * HTTP layer, with `providers.live` wired to the REAL PelezaProvider (not a
 * second MockProvider, unlike the other HTTP test files' simplified
 * fixture) so this actually exercises the production composition.
 */

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.PELEZA_CLIENT_ID;
  delete process.env.PELEZA_CLIENT_SECRET;
  delete process.env.PELEZA_BASE_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("boot safety without Peleza credentials configured", () => {
  it("constructing PelezaProvider() does not throw when PELEZA_CLIENT_ID/SECRET/BASE_URL are absent", () => {
    expect(() => new PelezaProvider()).not.toThrow();
  });

  it("buildApp() with a real (uncredentialed) PelezaProvider in the live slot does not throw", () => {
    const persistence = new InMemoryPersistence();
    expect(() =>
      buildApp({
        keyStore: persistence,
        operators: persistence,
        sessions: persistence,
        customers: persistence,
        decisions: persistence,
        audit: persistence,
        graph: persistence,
        cases: persistence,
        feedback: persistence,
        providers: { test: new MockProvider(), live: new PelezaProvider() },
      }),
    ).not.toThrow();
  });
});

describe("the mock demo path (sk_test_) never touches the network, even with a real PelezaProvider wired in the live slot", () => {
  it("a full sk_test_ decision through HTTP succeeds and makes zero fetch calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const persistence = new InMemoryPersistence();
    const TEST_KEY = "sk_test_deploy_safety";
    persistence.seedApiKey(TEST_KEY, {
      id: "key_deploy_safety",
      mode: "test",
      customerId: "cust_deploy_safety",
      scopes: ["decisions:write", "decisions:read"],
    });
    const app = buildApp({
      keyStore: persistence,
      operators: persistence,
      sessions: persistence,
      customers: persistence,
      decisions: persistence,
      audit: persistence,
      graph: persistence,
      cases: persistence,
      feedback: persistence,
      // Production reality: live slot is the REAL PelezaProvider, uncredentialed.
      providers: { test: new MockProvider(), live: new PelezaProvider() },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: `Bearer ${TEST_KEY}` },
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000004" },
        event_data: { disbursement_account: { account_number: "10000004", bank_id: 34 } },
        initiated_by: "api",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
