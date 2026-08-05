import { describe, it, expect } from "vitest";
import type { DecisionRequest } from "@xobriq/shared";
import { decide, type DecideDeps } from "../src/application/decide.js";
import { AppError } from "../src/shared/errors.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

function depsFor(persistence: InMemoryPersistence): DecideDeps {
  return { provider: new MockProvider(), graph: persistence, decisions: persistence, audit: persistence, cases: persistence };
}

const CUSTOMER = "cust_test_1";

const CLEAN_REQUEST: DecisionRequest = {
  event_type: "loan_application",
  subject: { national_id: "10000001", phone: "+254711000001" },
  event_data: {
    amount: 50000,
    currency: "KES",
    disbursement_account: { account_number: "10000001", account_name: "Alice Wanjiru Kamau" },
  },
  initiated_by: "api",
  device: { fingerprint: "device_alice_own" },
};

describe("degraded audit path (FOUNDATION §6.3 — review priority 3)", () => {
  it("still returns a decision, buffers the record, and surfaces the gap as a signal", async () => {
    const persistence = new InMemoryPersistence();
    persistence.forceAuditFailure = true;

    const response = await decide(CLEAN_REQUEST, { customerId: CUSTOMER }, depsFor(persistence));

    // The decision still returns — a failed audit write is never a crash.
    expect(response.recommended_action).toBe("ALLOW");
    expect(response.audit_id).toBeTruthy();

    // The record was never thrown away — it landed in the outbox.
    expect(persistence.pendingAudit).toHaveLength(1);
    expect(persistence.pendingAudit[0]?.decisionId).toBe(response.id);
    expect(persistence.pendingAudit[0]?.id).toBe(response.audit_id);

    // The gap is visible in signals_used, not silent.
    const auditSignal = response.signals_used.find((s) => s.source === "audit_chain");
    expect(auditSignal?.status).toBe("error");
    expect(auditSignal?.reason).toMatch(/pending_audit/);
  });

  it("a healthy audit path records nothing in the outbox", async () => {
    const persistence = new InMemoryPersistence();
    const response = await decide(CLEAN_REQUEST, { customerId: CUSTOMER }, depsFor(persistence));

    expect(persistence.pendingAudit).toHaveLength(0);
    const auditSignal = response.signals_used.find((s) => s.source === "audit_chain");
    expect(auditSignal?.status).toBe("success");
  });
});

describe("idempotency", () => {
  it("the same key + body returns the identical prior decision, without creating a second one", async () => {
    const persistence = new InMemoryPersistence();
    const context = { customerId: CUSTOMER, idempotencyKey: "idem-key-1" };

    const first = await decide(CLEAN_REQUEST, context, depsFor(persistence));
    const second = await decide(CLEAN_REQUEST, context, depsFor(persistence));

    expect(second).toEqual(first);
    const stored = await persistence.findById(first.id, CUSTOMER);
    expect(stored).not.toBeNull();
  });

  it("the same key with a different body is a conflict, not a silent replay", async () => {
    const persistence = new InMemoryPersistence();
    const context = { customerId: CUSTOMER, idempotencyKey: "idem-key-2" };

    await decide(CLEAN_REQUEST, context, depsFor(persistence));

    const differentRequest: DecisionRequest = { ...CLEAN_REQUEST, reference_id: "a-different-reference" };
    await expect(decide(differentRequest, context, depsFor(persistence))).rejects.toThrow(AppError);
  });
});
