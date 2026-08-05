import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/interfaces/http/app.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

const CUSTOMER = "cust_auth_1";
const OTHER_CUSTOMER = "cust_auth_2";

function buildTestApp(): { app: FastifyInstance; persistence: InMemoryPersistence } {
  const persistence = new InMemoryPersistence();
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

async function login(app: FastifyInstance, email: string, password: string) {
  return app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
}

describe("login", () => {
  it("succeeds with correct credentials and issues a session token", async () => {
    const { app, persistence } = buildTestApp();
    persistence.seedCustomer({ id: CUSTOMER, name: "Acme Lending" });
    await persistence.seedOperator("admin@acme.com", "correct-horse-battery", { customerId: CUSTOMER, role: "admin" });

    const res = await login(app, "admin@acme.com", "correct-horse-battery");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toMatch(/^sess_/);
    expect(body.customer_id).toBe(CUSTOMER);
    expect(body.customer_name).toBe("Acme Lending");
    expect(body.role).toBe("admin");
  });

  it("wrong password -> 401 with a generic message", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedOperator("admin@acme.com", "correct-horse-battery", { customerId: CUSTOMER });

    const res = await login(app, "admin@acme.com", "wrong-password");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe("Email or password is incorrect.");
  });

  it("unknown email -> the SAME 401 and message as a wrong password (no user enumeration)", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedOperator("admin@acme.com", "correct-horse-battery", { customerId: CUSTOMER });

    const unknownEmailRes = await login(app, "nobody@acme.com", "whatever");
    const wrongPasswordRes = await login(app, "admin@acme.com", "whatever");

    expect(unknownEmailRes.statusCode).toBe(wrongPasswordRes.statusCode);
    expect(unknownEmailRes.json().error.message).toBe(wrongPasswordRes.json().error.message);
    expect(unknownEmailRes.json().error.code).toBe("UNAUTHENTICATED");
  });
});

describe("session middleware", () => {
  it("missing Authorization header -> 401", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("malformed/unknown session token -> 401", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: "Bearer sess_not_a_real_token" } });
    expect(res.statusCode).toBe(401);
  });

  it("expired session -> 401", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedOperator("admin@acme.com", "pw", { customerId: CUSTOMER });
    const loginRes = await login(app, "admin@acme.com", "pw");
    const token = loginRes.json().token;

    // Simulate expiry by seeding a second, already-expired session under the same token hash path isn't
    // directly possible via the public API, so we drop the TTL by re-seeding through the store directly.
    const expired = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(expired.statusCode).toBe(200); // sanity: the fresh session works

    // Force-expire by writing an already-past expiry for a fresh session.
    const rawToken = "sess_" + "expired".repeat(8);
    await persistence.createSession({
      id: "sess-expired-1",
      customerId: CUSTOMER,
      userEmail: "admin@acme.com",
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${rawToken}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe("tenant isolation via session", () => {
  it("a logged-in org's decisions resolve to ITS customer_id, never another org's", async () => {
    const { app, persistence } = buildTestApp();
    persistence.seedCustomer({ id: CUSTOMER, name: "Acme" });
    persistence.seedCustomer({ id: OTHER_CUSTOMER, name: "Beta" });
    await persistence.seedOperator("acme-admin@acme.com", "pw", { customerId: CUSTOMER });
    await persistence.seedOperator("beta-admin@beta.com", "pw", { customerId: OTHER_CUSTOMER });

    const acmeToken = (await login(app, "acme-admin@acme.com", "pw")).json().token;
    const betaToken = (await login(app, "beta-admin@beta.com", "pw")).json().token;

    const decisionRes = await app.inject({
      method: "POST",
      url: "/v1/decisions",
      headers: { authorization: `Bearer ${acmeToken}` },
      payload: { event_type: "loan_application", subject: { national_id: "10000001" }, initiated_by: "api" },
    });
    expect(decisionRes.statusCode).toBe(200);
    const decisionId = decisionRes.json().id;

    // Acme can read its own decision.
    const acmeRead = await app.inject({ method: "GET", url: `/v1/decisions/${decisionId}`, headers: { authorization: `Bearer ${acmeToken}` } });
    expect(acmeRead.statusCode).toBe(200);

    // Beta cannot — 404, not 403, so existence never leaks cross-tenant.
    const betaRead = await app.inject({ method: "GET", url: `/v1/decisions/${decisionId}`, headers: { authorization: `Bearer ${betaToken}` } });
    expect(betaRead.statusCode).toBe(404);
  });
});

describe("API keys: list + rotate", () => {
  it("rotation: old key stops working, new key works, secret shown once", async () => {
    const { app, persistence } = buildTestApp();
    persistence.seedCustomer({ id: CUSTOMER, name: "Acme" });
    await persistence.seedOperator("admin@acme.com", "pw", { customerId: CUSTOMER, role: "admin" });
    const sessionToken = (await login(app, "admin@acme.com", "pw")).json().token;

    const oldRawKey = "sk_test_original_fixture_key";
    persistence.seedApiKey(oldRawKey, { id: "key_old", mode: "test", customerId: CUSTOMER, scopes: ["decisions:read"] });

    const listRes = await app.inject({ method: "GET", url: "/v1/keys", headers: { authorization: `Bearer ${sessionToken}` } });
    expect(listRes.statusCode).toBe(200);
    const keyId = listRes.json().items.find((k: { id: string }) => k.id === "key_old").id;

    const rotateRes = await app.inject({
      method: "POST",
      url: `/v1/keys/${keyId}/rotate`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(rotateRes.statusCode).toBe(200);
    const { secret: newRawKey } = rotateRes.json();
    expect(newRawKey).toMatch(/^sk_test_/);

    // Old key is dead.
    const oldKeyCheck = await app.inject({
      method: "GET",
      url: "/v1/decisions?initiated_by=manual",
      headers: { authorization: `Bearer ${oldRawKey}` },
    });
    expect(oldKeyCheck.statusCode).toBe(401);

    // New key works.
    const newKeyCheck = await app.inject({
      method: "GET",
      url: "/v1/decisions?initiated_by=manual",
      headers: { authorization: `Bearer ${newRawKey}` },
    });
    expect(newKeyCheck.statusCode).toBe(200);
  });

  it("rotation requires an admin session — an API key can't rotate keys", async () => {
    const { app, persistence } = buildTestApp();
    const rawKey = "sk_test_not_an_admin_fixture_key";
    persistence.seedApiKey(rawKey, { id: "key_x", mode: "test", customerId: CUSTOMER, scopes: ["decisions:read"] });

    const res = await app.inject({ method: "POST", url: "/v1/keys/key_x/rotate", headers: { authorization: `Bearer ${rawKey}` } });
    expect(res.statusCode).toBe(403);
  });

  it("rotation requires the admin role — an operator session can't rotate keys", async () => {
    const { app, persistence } = buildTestApp();
    persistence.seedCustomer({ id: CUSTOMER, name: "Acme" });
    await persistence.seedOperator("staff@acme.com", "pw", { customerId: CUSTOMER, role: "operator" });
    const rawKey = "sk_test_for_rotate_fixture_key";
    persistence.seedApiKey(rawKey, { id: "key_y", mode: "test", customerId: CUSTOMER, scopes: ["decisions:read"] });

    const sessionToken = (await login(app, "staff@acme.com", "pw")).json().token;
    const res = await app.inject({
      method: "POST",
      url: "/v1/keys/key_y/rotate",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("logout", () => {
  it("invalidates the session — the token stops working immediately after", async () => {
    const { app, persistence } = buildTestApp();
    await persistence.seedOperator("admin@acme.com", "pw", { customerId: CUSTOMER });
    const token = (await login(app, "admin@acme.com", "pw")).json().token;

    const before = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(before.statusCode).toBe(200);

    const logoutRes = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { authorization: `Bearer ${token}` } });
    expect(logoutRes.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(401);
  });
});
