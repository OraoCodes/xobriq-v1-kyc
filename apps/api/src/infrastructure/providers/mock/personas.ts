import type { CreditSignal } from "../../../domain/ports/identity-provider.js";

/**
 * THE SEVEN CANONICAL SANDBOX PERSONAS (plus the two hard-rule cases) — the
 * acceptance spec for the engine. Once the cascade orchestrator exists, each
 * one resolves end to end to its documented expected verdict. Every field
 * below is synthetic; no real PII.
 *
 * Personas 3 and 6 depend on graph state (device sharing / a flagged linked
 * entity) that lives in the persistence layer, not here — this table
 * deliberately gives both a CLEAN identity+credit picture. The graph signal
 * joins later, at the point marked on each fixture below.
 *
 * Every lookup in MockProvider is keyed by this same national_id string,
 * including getBankAccountName/getKraTaxpayerName (which in production key
 * by account number / KRA pin respectively). The sandbox's job is a stable,
 * reviewable fixture table, not modelling real per-vendor request shapes —
 * that realism lives in PelezaProvider instead.
 */
export interface MockPersonaFixture {
  national_id: string;
  scenario: string;
  expected_verdict: string;
  identity: {
    id_valid: boolean;
    full_name: string | null;
    dob: string | null;
    gender: string | null;
    phone_on_record: string | null;
  };
  bank_account_name: string | null;
  kra_taxpayer_name: string | null;
  dl_dob: string | null;
  credit: { kind: "success"; signal: CreditSignal } | { kind: "not_found" } | { kind: "timeout" };
}

const CLEAN_CREDIT: CreditSignal = {
  inquiries_7d: 0,
  distinct_recent_inquirers: 0,
  open_applications: 0,
  overdue_ratio: 0,
  worst_days_in_arrears: 0,
  report_status: "found",
};

export const MOCK_PERSONAS: readonly MockPersonaFixture[] = [
  {
    national_id: "10000001",
    scenario: "clean — valid IPRS, names match, no recent inquiries",
    expected_verdict: "ALLOW (confidence > 90)",
    identity: {
      id_valid: true,
      full_name: "Alice Wanjiru Kamau",
      dob: "1990-05-14",
      gender: "F",
      phone_on_record: "+254711000001",
    },
    bank_account_name: "Alice Wanjiru Kamau",
    kra_taxpayer_name: "Alice Wanjiru Kamau",
    dl_dob: "1990-05-14",
    credit: { kind: "success", signal: CLEAN_CREDIT },
  },
  {
    national_id: "10000002",
    scenario: "IPRS invalid",
    expected_verdict: "BLOCK (hard rule)",
    identity: { id_valid: false, full_name: null, dob: null, gender: null, phone_on_record: null },
    bank_account_name: null,
    kra_taxpayer_name: null,
    dl_dob: null,
    credit: { kind: "not_found" },
  },
  {
    national_id: "10000003",
    scenario: "valid ID, device shared across 5 identities",
    expected_verdict: "REVIEW",
    // Provider half is honest and clean; device.reuse_count_30d joins from
    // the persistence layer's graph query, not from this fixture.
    identity: {
      id_valid: true,
      full_name: "Brian Otieno Odhiambo",
      dob: "1994-02-20",
      gender: "M",
      phone_on_record: "+254711000003",
    },
    bank_account_name: "Brian Otieno Odhiambo",
    kra_taxpayer_name: "Brian Otieno Odhiambo",
    dl_dob: "1994-02-20",
    credit: { kind: "success", signal: CLEAN_CREDIT },
  },
  {
    national_id: "10000004",
    scenario: "valid ID + bank-name mismatch + 3 inquiries/7d (the thesis case)",
    expected_verdict: "BLOCK or REVIEW",
    identity: {
      id_valid: true,
      full_name: "Caroline Achieng Otieno",
      dob: "1988-11-03",
      gender: "F",
      phone_on_record: "+254711000004",
    },
    // Deliberate mismatch: the disbursement account belongs to someone else.
    bank_account_name: "Dennis Mwangi Kiptoo",
    kra_taxpayer_name: "Caroline Achieng Otieno",
    dl_dob: "1988-11-03",
    credit: {
      kind: "success",
      signal: {
        inquiries_7d: 3,
        distinct_recent_inquirers: 3,
        open_applications: 2,
        overdue_ratio: 0.1,
        worst_days_in_arrears: 5,
        report_status: "found",
      },
    },
  },
  {
    national_id: "10000005",
    scenario: "thin file, new device",
    expected_verdict: "STEP_UP (low confidence)",
    identity: {
      id_valid: true,
      full_name: "Elijah Mutiso Kilonzo",
      dob: "2001-06-10",
      gender: "M",
      phone_on_record: null,
    },
    bank_account_name: "Elijah Mutiso Kilonzo",
    kra_taxpayer_name: null,
    dl_dob: null,
    credit: {
      kind: "success",
      signal: {
        inquiries_7d: 0,
        distinct_recent_inquirers: 0,
        open_applications: 0,
        overdue_ratio: 0,
        worst_days_in_arrears: 0,
        report_status: "thin_file",
      },
    },
  },
  {
    national_id: "10000006",
    scenario: "graph-linked entity flagged (single-tenant)",
    expected_verdict: "BLOCK",
    // Provider half is honest and clean; graph.entity_flagged joins from the
    // persistence layer's graph query, not from this fixture.
    identity: {
      id_valid: true,
      full_name: "Faith Njeri Kariuki",
      dob: "1992-09-15",
      gender: "F",
      phone_on_record: "+254711000006",
    },
    bank_account_name: "Faith Njeri Kariuki",
    kra_taxpayer_name: "Faith Njeri Kariuki",
    dl_dob: "1992-09-15",
    credit: { kind: "success", signal: CLEAN_CREDIT },
  },
  {
    national_id: "10000007",
    scenario: "Creditinfo times out",
    expected_verdict: "degraded decision, no crash; timeout recorded",
    identity: {
      id_valid: true,
      full_name: "George Kiplagat Rono",
      dob: "1985-03-22",
      gender: "M",
      phone_on_record: "+254711000007",
    },
    bank_account_name: "George Kiplagat Rono",
    kra_taxpayer_name: "George Kiplagat Rono",
    dl_dob: "1985-03-22",
    credit: { kind: "timeout" },
  },
  {
    national_id: "10000008",
    scenario: "under 18",
    expected_verdict: "BLOCK (hard rule)",
    identity: {
      id_valid: true,
      full_name: "Hope Wanjiku Ndegwa",
      dob: "2015-01-01",
      gender: "F",
      phone_on_record: null,
    },
    bank_account_name: null,
    kra_taxpayer_name: null,
    dl_dob: null,
    credit: { kind: "not_found" },
  },
];

export function findPersona(nationalId: string): MockPersonaFixture | undefined {
  return MOCK_PERSONAS.find((p) => p.national_id === nationalId);
}
