import { describe, it, expect } from "vitest";
import type { DecisionRequest, DisbursementAccount } from "@xobriq/shared";
import { decide, type DecideDeps } from "../src/application/decide.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";

/**
 * Dedicated coverage for wiring bank_id from the request through to the
 * bank cross-check. Persona 10000004 (Caroline Achieng Otieno / IPRS) has a
 * disbursement account belonging to Dennis Mwangi Kiptoo — a genuine name
 * mismatch — but the mismatch only surfaces if a valid bank_id accompanies
 * account_number, per the "never guess a bank" design.
 */

function depsFor(persistence: InMemoryPersistence): DecideDeps {
  return { provider: new MockProvider(), graph: persistence, decisions: persistence, audit: persistence, cases: persistence };
}

const CUSTOMER = "cust_test_1";

function thesisRequest(disbursementAccount: DisbursementAccount): DecisionRequest {
  return {
    event_type: "loan_application",
    subject: { national_id: "10000004", phone: "+254711000004" },
    event_data: {
      amount: 80000,
      currency: "KES",
      disbursement_account: disbursementAccount,
    },
    initiated_by: "api",
    device: { fingerprint: "device_thesis_wiring" },
  };
}

describe("bank_id wiring — the thesis-case mismatch only fires with a valid bank_id", () => {
  it("account_number alone, no bank_id → bank signal skips, no mismatch surfaces", async () => {
    const persistence = new InMemoryPersistence();
    const request = thesisRequest({ account_number: "10000004", account_name: "Dennis Mwangi Kiptoo" });

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.signals_used.find((s) => s.source === "bank_verification")?.status).toBe("skipped");
    expect(response.risk_reasons.some((r) => r.code === "BANK_NAME_MISMATCH")).toBe(false);
  });

  it("account_number + an INVALID bank_id → still skips, never calls the provider with a bad id", async () => {
    const persistence = new InMemoryPersistence();
    const request = thesisRequest({ account_number: "10000004", account_name: "Dennis Mwangi Kiptoo", bank_id: 99999 });

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.signals_used.find((s) => s.source === "bank_verification")?.status).toBe("skipped");
    expect(response.risk_reasons.some((r) => r.code === "BANK_NAME_MISMATCH")).toBe(false);
  });

  it("account_number + a VALID bank_id → the bank check runs, the mismatch surfaces, and the thesis-case BLOCKs or REVIEWs", async () => {
    const persistence = new InMemoryPersistence();
    const request = thesisRequest({ account_number: "10000004", account_name: "Dennis Mwangi Kiptoo", bank_id: 34 });

    const response = await decide(request, { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.signals_used.find((s) => s.source === "bank_verification")?.status).toBe("success");
    expect(response.risk_reasons.some((r) => r.code === "BANK_NAME_MISMATCH")).toBe(true);
    expect(["BLOCK", "REVIEW"]).toContain(response.recommended_action);
  });
});
