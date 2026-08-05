import { describe, it, expect } from "vitest";
import type { DecisionRequest } from "@xobriq/shared";
import { decide, type DecideDeps } from "../src/application/decide.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

function depsFor(persistence: InMemoryPersistence): DecideDeps {
  return { provider: new MockProvider(), graph: persistence, decisions: persistence, audit: persistence, cases: persistence };
}

const CUSTOMER = "cust_test_1";

describe("the seven-persona acceptance suite (plus the two hard-rule cases)", () => {
  it("10000001 — clean: ALLOW with confidence > 90", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
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

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("ALLOW");
    expect(response.confidence_score).toBeGreaterThan(90);
  });

  it("10000002 — IPRS invalid: BLOCK via hard rule", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000002" },
      initiated_by: "api",
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("BLOCK");
    expect(response.risk_reasons[0]?.code).toBe("IDENTITY_NOT_VERIFIED");
  });

  it("10000003 — device shared across 5 identities: REVIEW", async () => {
    const persistence = new InMemoryPersistence();
    await persistence.seedDeviceSharedBy("device_shared_001", 5);

    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000003", phone: "+254711000003" },
      initiated_by: "api",
      device: { fingerprint: "device_shared_001" },
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("REVIEW");
    expect(response.risk_reasons.some((r) => r.code === "DEVICE_SHARED")).toBe(true);
  });

  it("10000004 — bank-name mismatch + 3 inquiries/7d (the thesis case): BLOCK or REVIEW", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000004", phone: "+254711000004" },
      event_data: {
        amount: 80000,
        currency: "KES",
        disbursement_account: { account_number: "10000004", account_name: "Dennis Mwangi Kiptoo" },
      },
      initiated_by: "api",
      device: { fingerprint: "device_caroline_own" },
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(["BLOCK", "REVIEW"]).toContain(response.recommended_action);
    expect(response.risk_reasons.some((r) => r.code === "BANK_NAME_MISMATCH")).toBe(true);
    expect(response.risk_reasons.some((r) => r.code === "CREDIT_INQUIRIES_ELEVATED")).toBe(true);
  });

  it("10000005 — thin file, new device: STEP_UP with low confidence", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000005" },
      initiated_by: "api",
      device: { fingerprint: "device_elijah_new" },
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("STEP_UP");
    expect(response.step_up_options.length).toBeGreaterThan(0);
  });

  it("10000006 — graph-linked entity flagged: BLOCK, resolved for real via the graph", async () => {
    const persistence = new InMemoryPersistence();
    await persistence.seedFlaggedEntity("person", "10000006");

    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000006", phone: "+254711000006" },
      event_data: {
        amount: 60000,
        currency: "KES",
        disbursement_account: { account_number: "10000006", account_name: "Faith Njeri Kariuki" },
      },
      initiated_by: "api",
      device: { fingerprint: "device_faith_own" },
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("BLOCK");
    expect(response.risk_reasons.some((r) => r.code === "GRAPH_ENTITY_FLAGGED")).toBe(true);
  });

  it("10000007 — Creditinfo times out: degraded decision, no crash, timeout recorded", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000007", phone: "+254711000007" },
      event_data: {
        amount: 70000,
        currency: "KES",
        disbursement_account: { account_number: "10000007", account_name: "George Kiplagat Rono" },
      },
      initiated_by: "api",
      device: { fingerprint: "device_george_own" },
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(["ALLOW", "BLOCK", "REVIEW", "STEP_UP"]).toContain(response.recommended_action);
    const creditSignal = response.signals_used.find((s) => s.source === "credit_bureau");
    expect(creditSignal?.status).toBe("timeout");
  });

  it("10000008 — under 18: BLOCK via hard rule", async () => {
    const persistence = new InMemoryPersistence();
    const request: DecisionRequest = {
      event_type: "loan_application",
      subject: { national_id: "10000008" },
      initiated_by: "api",
    };

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("BLOCK");
    expect(response.risk_reasons[0]?.code).toBe("APPLICANT_UNDER_18");
  });
});
