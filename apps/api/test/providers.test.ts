import { describe, it, expect } from "vitest";
import { MockProvider } from "../src/infrastructure/providers/mock/mock-provider.js";
import { MOCK_PERSONAS } from "../src/infrastructure/providers/mock/personas.js";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";

const mock = new MockProvider();
const peleza = new PelezaProvider();

describe("MockProvider — the seven canonical personas", () => {
  for (const persona of MOCK_PERSONAS) {
    it(`${persona.national_id} (${persona.scenario}) — getIdentity matches the fixture`, async () => {
      const result = await mock.getIdentity(persona.national_id);
      expect(result.status).toBe("success");
      expect(result.data).toEqual({
        id_valid: persona.identity.id_valid,
        full_name: persona.identity.full_name,
        dob: persona.identity.dob,
        gender: persona.identity.gender,
        ...(persona.identity.phone_on_record ? { phone_on_record: persona.identity.phone_on_record } : {}),
      });
      expect(typeof result.latencyMs).toBe("number");
    });
  }

  it("persona 10000002 (IPRS invalid) reports id_valid: false, not a provider-level failure", async () => {
    const result = await mock.getIdentity("10000002");
    expect(result.status).toBe("success");
    expect(result.data?.id_valid).toBe(false);
  });

  it("persona 10000008 (under 18) has a dob young enough to trip the hard rule", async () => {
    const result = await mock.getIdentity("10000008");
    expect(result.data?.dob).toBe("2015-01-01");
  });

  it("persona 10000004 (thesis case) — bank name mismatches the identity, KRA matches", async () => {
    const identity = await mock.getIdentity("10000004");
    const bank = await mock.getBankAccountName("10000004");
    const kra = await mock.getKraTaxpayerName("10000004");

    expect(bank.data?.bank_account_name).not.toBe(identity.data?.full_name);
    expect(kra.data?.kra_taxpayer_name).toBe(identity.data?.full_name);

    const credit = await mock.getCredit("10000004");
    expect(credit.status).toBe("success");
    expect(credit.data?.inquiries_7d).toBe(3);
  });

  it("persona 10000007 — credit lookup returns status: timeout, never throws", async () => {
    const result = await mock.getCredit("10000007");
    expect(result.status).toBe("timeout");
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("an unknown national_id returns not_found, never throws", async () => {
    const result = await mock.getIdentity("99999999");
    expect(result.status).toBe("not_found");
    expect(result.data).toBeNull();
  });

  it("personas 3 and 6 (graph-dependent) get a clean identity from the provider — the graph signal is out of scope here", async () => {
    const shared = await mock.getIdentity("10000003");
    const flagged = await mock.getIdentity("10000006");
    expect(shared.data?.id_valid).toBe(true);
    expect(flagged.data?.id_valid).toBe(true);
  });
});

// getIdentity, getBankAccountName, and getCredit are now real, authenticated
// HTTP calls (see peleza-provider.ts) and are covered — mocked fetch, error
// mapping, and parity vs MockProvider — in peleza-kenya-id.test.ts,
// peleza-bank-account.test.ts, and peleza-credit-info.test.ts respectively.
// KRA/driving-licence below still serve the earlier modeled/unverified
// fixture pipeline (see types.ts) and are untouched here.
describe("PelezaProvider — modeled KRA/driving-licence envelope parsing", () => {
  it("parses the KRA and driving-licence envelopes into narrow fragments", async () => {
    const kra = await peleza.getKraTaxpayerName("A001234567B");
    const dl = await peleza.getDrivingLicence("10000001");

    expect(kra.data).toEqual({ kra_taxpayer_name: "Alice Wanjiru Kamau" });
    expect(dl.data).toEqual({ dl_dob: "1990-05-14" });
  });

  it("getBankAccountName without a bank_id returns not_found rather than fabricating one", async () => {
    const bank = await peleza.getBankAccountName("0011223344");
    expect(bank.status).toBe("not_found");
    expect(bank.data).toBeNull();
  });
});
