import { describe, it, expect } from "vitest";
import type { DecisionRequest } from "@xobriq/shared";
import { decide, type DecideDeps } from "../src/application/decide.js";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { InMemoryPersistence } from "./fakes/in-memory-persistence.js";
import type {
  IdentityProvider,
  IdentitySignal,
  CreditSignal,
  ProviderResult,
} from "../src/domain/ports/identity-provider.js";

const CUSTOMER = "cust_applicant_credit_detail";

function depsFor(persistence: InMemoryPersistence, provider: IdentityProvider = new MockProvider()): DecideDeps {
  return { provider, graph: persistence, decisions: persistence, audit: persistence, cases: persistence };
}

/** A fake provider whose credit lookup carries the analyst-detail fields, unlike MockProvider. */
class CreditDetailProvider implements IdentityProvider {
  async getIdentity(): Promise<ProviderResult<IdentitySignal>> {
    return { status: "success", data: { id_valid: true, full_name: "Jane Analyst Subject", dob: "1990-01-01", gender: "F" }, latencyMs: 1 };
  }
  async getCredit(): Promise<ProviderResult<CreditSignal>> {
    return {
      status: "success",
      data: {
        open_applications: 1,
        overdue_ratio: 0,
        worst_days_in_arrears: 0,
        report_status: "found",
        credit_score: "540.00",
        delinquency_code: "003",
        is_guarantor: true,
      },
      latencyMs: 1,
    };
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

const request = (nationalId: string): DecisionRequest => ({
  event_type: "loan_application",
  subject: { national_id: nationalId },
  initiated_by: "api",
});

describe("applicant.full_name and credit_detail — analyst-detail fields on DecisionResponse", () => {
  it("a clean MockProvider decision reports the applicant's core identity fields but omits credit_detail (Mock never sets those fields)", async () => {
    const persistence = new InMemoryPersistence();
    const response = await decide(request("10000001"), { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.applicant).toEqual({
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
      phone_on_record: "+254711000001",
    });
    expect(response.credit_detail).toBeUndefined();
  });

  it("a hard-rule BLOCK (invalid identity) reports id_valid: false, full_name: null, no credit_detail (tier 2a never ran)", async () => {
    const persistence = new InMemoryPersistence();
    const response = await decide(request("10000002"), { customerId: CUSTOMER }, depsFor(persistence));

    expect(response.recommended_action).toBe("BLOCK");
    expect(response.applicant).toEqual({ id_valid: false, full_name: null, dob: null, gender: null });
    expect(response.credit_detail).toBeUndefined();
  });

  it("surfaces phone/deceased/pin/biometric fields when the identity source provides them (e.g. sandbox /id/ke)", async () => {
    const persistence = new InMemoryPersistence();
    const richIdentityProvider: IdentityProvider = {
      async getIdentity(): Promise<ProviderResult<IdentitySignal>> {
        return {
          status: "success",
          data: {
            id_valid: true,
            full_name: "Rich Detail Subject",
            dob: "1985-06-01",
            gender: "M",
            phone_on_record: "+254700000000",
            date_of_death: null,
            pin: "A123456789Z",
            has_photo: true,
            has_fingerprint: false,
            has_signature: true,
          },
          latencyMs: 1,
        };
      },
      async getCredit(): Promise<ProviderResult<CreditSignal>> {
        return { status: "not_found", data: null, latencyMs: 1 };
      },
      async getBankAccountName(): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>> {
        return { status: "not_found", data: null, latencyMs: 1 };
      },
      async getKraTaxpayerName(): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>> {
        return { status: "not_found", data: null, latencyMs: 1 };
      },
      async getDrivingLicence(): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>> {
        return { status: "not_found", data: null, latencyMs: 1 };
      },
    };

    const response = await decide(request("55555555"), { customerId: CUSTOMER }, depsFor(persistence, richIdentityProvider));

    expect(response.applicant).toEqual({
      id_valid: true,
      full_name: "Rich Detail Subject",
      dob: "1985-06-01",
      gender: "M",
      phone_on_record: "+254700000000",
      date_of_death: null,
      pin: "A123456789Z",
      has_photo: true,
      has_fingerprint: false,
      has_signature: true,
    });
  });

  it("a provider that supplies credit_score/delinquency_code/is_guarantor surfaces them in credit_detail", async () => {
    const persistence = new InMemoryPersistence();
    const response = await decide(request("99999999"), { customerId: CUSTOMER }, depsFor(persistence, new CreditDetailProvider()));

    expect(response.applicant?.full_name).toBe("Jane Analyst Subject");
    expect(response.credit_detail).toEqual({ score: "540.00", delinquency_code: "003", is_guarantor: true });
  });

  it("credit_detail and applicant are never persisted to the DecisionRecord fetched later via GET", async () => {
    const persistence = new InMemoryPersistence();
    const created = await decide(request("99999999"), { customerId: CUSTOMER }, depsFor(persistence, new CreditDetailProvider()));

    const fetched = await persistence.findById(created.id, CUSTOMER);
    expect(fetched).not.toBeNull();
    expect((fetched as unknown as Record<string, unknown>).applicant).toBeUndefined();
    expect((fetched as unknown as Record<string, unknown>).creditDetail).toBeUndefined();
    expect((fetched as unknown as Record<string, unknown>).credit_detail).toBeUndefined();
  });
});
