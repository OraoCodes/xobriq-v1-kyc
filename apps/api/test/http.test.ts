import { describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/interfaces/http/app.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

const CUSTOMER = "cust_http_1";
const TEST_KEY = "sk_test_abc123";
const FULL_SCOPES = ["decisions:write", "decisions:read", "cases:read", "cases:write"] as const;

function buildTestApp(): { app: FastifyInstance; persistence: InMemoryPersistence } {
  const persistence = new InMemoryPersistence();
  persistence.seedApiKey(TEST_KEY, { id: "key_1", mode: "test", customerId: CUSTOMER, scopes: FULL_SCOPES });
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
    providers: { test: new MockProvider(), live: new MockProvider() },
  });
  return { app, persistence };
}

function authHeaders(key: string = TEST_KEY): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

describe("the seven personas, through HTTP (plus the two hard-rule cases)", () => {
  it("10000001 — clean: ALLOW with confidence > 90", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000001", phone: "+254711000001" },
        event_data: {
          amount: 50000,
          currency: "KES",
          disbursement_account: { account_number: "10000001", account_name: "Alice Wanjiru Kamau", bank_id: 34 },
        },
        initiated_by: "api",
        device: { fingerprint: "http_device_alice" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe("decision");
    expect(body.recommended_action).toBe("ALLOW");
    expect(body.confidence_score).toBeGreaterThan(90);
  });

  it("10000002 — IPRS invalid: BLOCK via hard rule", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000002" }, initiated_by: "api" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBe("BLOCK");
  });

  it("10000003 — device shared across 5 identities: REVIEW", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedDeviceSharedBy("http_device_shared", 5);
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000003", phone: "+254711000003" },
        initiated_by: "api",
        device: { fingerprint: "http_device_shared" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBe("REVIEW");
  });

  it("10000004 — bank-name mismatch + 3 inquiries/7d (the thesis case): BLOCK or REVIEW", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000004", phone: "+254711000004" },
        event_data: {
          amount: 80000,
          currency: "KES",
          disbursement_account: { account_number: "10000004", account_name: "Dennis Mwangi Kiptoo", bank_id: 34 },
        },
        initiated_by: "api",
        device: { fingerprint: "http_device_caroline" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(["BLOCK", "REVIEW"]).toContain(res.json().recommended_action);
  });

  it("10000005 — thin file, new device: STEP_UP", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000005" },
        initiated_by: "api",
        device: { fingerprint: "http_device_elijah" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBe("STEP_UP");
  });

  it("10000006 — graph-linked entity flagged: BLOCK, resolved via the graph", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedFlaggedEntity("person", "10000006");
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000006", phone: "+254711000006" },
        event_data: {
          amount: 60000,
          currency: "KES",
          disbursement_account: { account_number: "10000006", account_name: "Faith Njeri Kariuki", bank_id: 34 },
        },
        initiated_by: "api",
        device: { fingerprint: "http_device_faith" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBe("BLOCK");
  });

  it("10000007 — Creditinfo times out: degraded decision, no crash, timeout recorded", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000007", phone: "+254711000007" },
        event_data: {
          amount: 70000,
          currency: "KES",
          disbursement_account: { account_number: "10000007", account_name: "George Kiplagat Rono", bank_id: 34 },
        },
        initiated_by: "api",
        device: { fingerprint: "http_device_george" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(["ALLOW", "BLOCK", "REVIEW", "STEP_UP"]).toContain(body.recommended_action);
    const creditSignal = body.signals_used.find((s: { source: string }) => s.source === "credit_bureau");
    expect(creditSignal?.status).toBe("timeout");
  });

  it("10000008 — under 18: BLOCK via hard rule", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000008" }, initiated_by: "api" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommended_action).toBe("BLOCK");
  });
});

describe("auth", () => {
  const validPayload = { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" };

  it("no key -> 401", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "POST", url: "/v1/decisions", payload: validPayload });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("malformed key -> 401", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: "Bearer not-a-real-key" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("wrong scope -> 403", async () => {
    const persistence = new InMemoryPersistence();
    persistence.seedApiKey("sk_test_limited", { id: "key_2", mode: "test", customerId: CUSTOMER, scopes: ["cases:read"] });
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
      providers: { test: new MockProvider(), live: new MockProvider() },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders("sk_test_limited"),
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });
});

describe("validation", () => {
  it("malformed body -> 422 with field detail", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application" },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(body.error.details.issues.length).toBeGreaterThan(0);
  });

  it("an unrecognized bank_id -> 422 with a bank_id field issue, never reaches the provider", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000004" },
        event_data: { disbursement_account: { account_number: "10000004", bank_id: 99999 } },
        initiated_by: "api",
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues.some((i: { path: string }) => i.path === "event_data.disbursement_account.bank_id")).toBe(true);
  });
});

describe("idempotency", () => {
  const payload = { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" };

  it("same key + body -> identical decision", async () => {
    const { app } = buildTestApp();
    const first = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { ...authHeaders(), "idempotency-key": "idem-1" },
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { ...authHeaders(), "idempotency-key": "idem-1" },
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it("same key + different body -> 409", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { ...authHeaders(), "idempotency-key": "idem-2" },
      payload,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { ...authHeaders(), "idempotency-key": "idem-2" },
      payload: { ...payload, reference_id: "a-different-reference" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});

describe("tenant isolation", () => {
  it("fetching another customer's decision -> 404, not 403", async () => {
    const persistence = new InMemoryPersistence();
    persistence.seedApiKey(TEST_KEY, { id: "key_1", mode: "test", customerId: CUSTOMER, scopes: FULL_SCOPES });
    persistence.seedApiKey("sk_test_other", { id: "key_other", mode: "test", customerId: "cust_other", scopes: FULL_SCOPES });
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
      providers: { test: new MockProvider(), live: new MockProvider() },
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(TEST_KEY),
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    const decisionId = created.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/v1/decisions/${decisionId}`,
      headers: authHeaders("sk_test_other"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("initiated_by — derived server-side, never trusted from the body", () => {
  it("X-Xobriq-Manual header persists as manual, overriding a body that claims api", async () => {
    const { app, persistence } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { ...authHeaders(), "x-xobriq-manual": "true" },
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    expect(res.json().initiated_by).toBe("manual");
    const stored = await persistence.findById(res.json().id, CUSTOMER);
    expect(stored?.initiatedBy).toBe("manual");
  });

  it("a plain API call persists as api, even when the body claims manual", async () => {
    const { app, persistence } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "manual" },
    });
    expect(res.json().initiated_by).toBe("api");
    const stored = await persistence.findById(res.json().id, CUSTOMER);
    expect(stored?.initiatedBy).toBe("api");
  });
});

describe("kra_pin revives the KRA cross-check", () => {
  it("when kra_pin is provided, the KRA signal runs instead of being skipped", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000001", phone: "+254711000001" },
        event_data: { kra_pin: "10000001" },
        initiated_by: "api",
      },
    });
    expect(res.statusCode).toBe(200);
    const kraSignal = res.json().signals_used.find((s: { source: string }) => s.source === "kra_verification");
    expect(kraSignal?.status).not.toBe("skipped");
  });

  it("without kra_pin, the KRA signal stays skipped", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    const kraSignal = res.json().signals_used.find((s: { source: string }) => s.source === "kra_verification");
    expect(kraSignal?.status).toBe("skipped");
  });
});

describe("other routes — smoke coverage", () => {
  it("GET /health needs no auth", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /v1/decisions lists newest first and filters by initiated_by", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    const res = await app.inject({ method: "GET", url: "/v1/decisions?initiated_by=manual", headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(0);
  });

  it("GET /v1/stats returns the decision mix", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    const res = await app.inject({ method: "GET", url: "/v1/stats", headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.json().by_action.ALLOW).toBe(1);
  });

  it("cases: a REVIEW decision opens a case that can be resolved", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedDeviceSharedBy("http_device_case_flow", 5);
    const decisionRes = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: authHeaders(),
      payload: {
        event_type: "loan_application",
        subject: { national_id: "10000003" },
        initiated_by: "api",
        device: { fingerprint: "http_device_case_flow" },
      },
    });
    expect(decisionRes.json().recommended_action).toBe("REVIEW");

    const listRes = await app.inject({ method: "GET", url: "/v1/cases?status=open", headers: authHeaders() });
    expect(listRes.statusCode).toBe(200);
    const caseId = listRes.json().items[0].id;

    const resolveRes = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/resolve`,
      headers: authHeaders(),
      payload: { resolution: "confirmed_legitimate", reason_code: "device_family_shared" },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().status).toBe("resolved");

    const conflictRes = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/resolve`,
      headers: authHeaders(),
      payload: { resolution: "confirmed_legitimate", reason_code: "device_family_shared" },
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json().error.code).toBe("CASE_NOT_OPEN");
  });

  it("feedback: POST for an unknown decision -> 404", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/decisions/does-not-exist/feedback",
      headers: authHeaders(),
      payload: { outcome: "confirmed_legitimate" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("X-Xobriq-Version is echoed back, and rejected if malformed", async () => {
    const { app } = buildTestApp();
    const ok = await app.inject({ method: "GET", url: "/health", headers: { "x-xobriq-version": "2026-01-01" } });
    expect(ok.headers["x-xobriq-version"]).toBe("2026-01-01");

    const bad = await app.inject({ method: "GET", url: "/health", headers: { "x-xobriq-version": "not-a-date" } });
    expect(bad.statusCode).toBe(422);
  });
});
