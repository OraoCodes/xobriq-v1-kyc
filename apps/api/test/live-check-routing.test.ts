import { describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/interfaces/http/app.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";
import type {
  IdentityProvider,
  IdentitySignal,
  CreditSignal,
  ProviderResult,
} from "../src/domain/ports/identity-provider.js";

const CUSTOMER = "cust_live_routing";
const TEST_KEY = "sk_test_live_routing";
const LIVE_KEY = "sk_live_live_routing";
const FULL_SCOPES = ["decisions:write", "decisions:read", "cases:read", "cases:write"] as const;

/** A provider distinguishable from MockProvider — any decision it answers is unmistakably identifiable. */
class MarkerProvider implements IdentityProvider {
  async getIdentity(): Promise<ProviderResult<IdentitySignal>> {
    return { status: "success", data: { id_valid: true, full_name: "MARKER LIVE PROVIDER", dob: "1990-01-01", gender: "F" }, latencyMs: 1 };
  }
  async getCredit(): Promise<ProviderResult<CreditSignal>> {
    return { status: "success", data: { open_applications: 0, overdue_ratio: 0, worst_days_in_arrears: 0, report_status: "found" }, latencyMs: 1 };
  }
  async getBankAccountName(): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>> {
    return { status: "not_found", data: null, latencyMs: 1 };
  }
  async getKraTaxpayerName(): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>> {
    return { status: "not_found", data: null, latencyMs: 1 };
  }
  async getDrivingLicence(): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>> {
    return { status: "not_found", data: null, latencyMs: 1 };
  }
}

function buildTestApp(): { app: FastifyInstance; persistence: InMemoryPersistence } {
  const persistence = new InMemoryPersistence();
  persistence.seedApiKey(TEST_KEY, { id: "key_test", mode: "test", customerId: CUSTOMER, scopes: FULL_SCOPES });
  persistence.seedApiKey(LIVE_KEY, { id: "key_live", mode: "live", customerId: CUSTOMER, scopes: FULL_SCOPES });
  persistence.seedCustomer({ id: CUSTOMER, name: "Live Routing Test Org" });
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
    providers: { test: new MockProvider(), live: new MarkerProvider() },
  });
  return { app, persistence };
}

async function sessionToken(app: FastifyInstance, persistence: InMemoryPersistence): Promise<string> {
  await persistence.seedOperator("op@live-routing-test.com", "correct-horse-battery", { customerId: CUSTOMER, role: "admin" });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "op@live-routing-test.com", password: "correct-horse-battery" } });
  return res.json().token as string;
}

// An ID MockProvider does NOT recognize — it resolves not_found -> BLOCK (hard
// rule). MarkerProvider resolves ANY id as valid -> ALLOW. The verdict itself,
// not just the reported "mode" field, proves which provider actually answered.
const payload = { event_type: "loan_application", subject: { national_id: "99999999" }, initiated_by: "api" };

describe("live-check routing — the one narrow, explicit override of 'mode comes from the credential'", () => {
  it("a session WITHOUT the header uses MockProvider (unchanged default) — unrecognized id -> BLOCK, mode: test", async () => {
    const { app, persistence } = buildTestApp();
    const token = await sessionToken(app, persistence);

    const res = await app.inject({ method: "POST", url: "/v1/decisions", headers: { authorization: `Bearer ${token}` }, payload });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe("test");
    expect(body.recommended_action).toBe("BLOCK");
    expect(body.risk_reasons.some((r: { code: string }) => r.code === "IDENTITY_NOT_VERIFIED")).toBe(true);
  });

  it("a session WITH X-Xobriq-Live-Check: true routes to the live provider — same unrecognized id no longer BLOCKs, mode: live", async () => {
    const { app, persistence } = buildTestApp();
    const token = await sessionToken(app, persistence);

    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: `Bearer ${token}`, "x-xobriq-live-check": "true" },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe("live");
    // Only MarkerProvider (the live slot) would resolve this unrecognized-to-Mock id as
    // id_valid: true — MockProvider would BLOCK it. STEP_UP (not BLOCK) proves it.
    expect(body.recommended_action).toBe("STEP_UP");
  });

  it("an sk_test_ API key is NOT upgraded by the header — the header only applies to sessions", async () => {
    const { app } = buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: `Bearer ${TEST_KEY}`, "x-xobriq-live-check": "true" },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe("test");
    expect(body.recommended_action).toBe("BLOCK"); // still MockProvider, not upgraded
  });

  it("an sk_live_ API key stays live regardless of the header (already live via the key itself)", async () => {
    const { app } = buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: `Bearer ${LIVE_KEY}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe("live");
    expect(body.recommended_action).toBe("STEP_UP"); // MarkerProvider answered, not MockProvider (which would BLOCK)
  });
});
