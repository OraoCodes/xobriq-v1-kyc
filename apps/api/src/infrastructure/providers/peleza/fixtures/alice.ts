import type { PelezaKraEnvelope, PelezaDrivingLicenceEnvelope } from "../types.js";

/**
 * Synthetic fixtures for a single fictional applicant, deliberately the same
 * underlying person as MockProvider's persona 10000001 ("clean") — this lets
 * the parity test assert the parsed Peleza output and the mock output agree
 * on the normalised shape AND the values, not just the TS type. No real PII.
 *
 * The identity (Kenya-ID), bank-account, and credit-info fixtures live
 * separately now, in fixtures/kenya-id-sample.json,
 * fixtures/bank-account-sample.json, and fixtures/credit-info-sample.json —
 * the real envelope shapes, not this file's earlier modeled
 * status/code/data/meta convention.
 */

export const KRA_ENVELOPE_ALICE: PelezaKraEnvelope = {
  status: "SUCCESS",
  code: "00",
  message: "OK",
  data: {
    kra_pin: "A001234567B",
    taxpayer_name: "Alice Wanjiru Kamau",
  },
  meta: { request_id: "req_synthetic_004", response_time_ms: 160 },
};

export const DL_ENVELOPE_ALICE: PelezaDrivingLicenceEnvelope = {
  status: "SUCCESS",
  code: "00",
  message: "OK",
  data: {
    id_number: "10000001",
    licence_number: "DL0099887",
    date_of_birth: "14-05-1990",
  },
  meta: { request_id: "req_synthetic_005", response_time_ms: 140 },
};
