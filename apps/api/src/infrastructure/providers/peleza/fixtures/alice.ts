import type {
  PelezaIdentityEnvelope,
  PelezaBankVerificationEnvelope,
  PelezaKraEnvelope,
  PelezaDrivingLicenceEnvelope,
  PelezaCreditEnvelope,
} from "../types.js";

/**
 * Synthetic fixtures for a single fictional applicant, deliberately the same
 * underlying person as MockProvider's persona 10000001 ("clean") — this lets
 * the parity test assert the parsed Peleza output and the mock output agree
 * on the normalised shape AND the values, not just the TS type. No real PII.
 */

export const IDENTITY_ENVELOPE_ALICE: PelezaIdentityEnvelope = {
  status: "SUCCESS",
  code: "00",
  message: "OK",
  data: {
    person: {
      id_number: "10000001",
      id_status: "ACTIVE",
      first_name: "Alice",
      middle_name: "Wanjiru",
      last_name: "Kamau",
      gender: "FEMALE",
      date_of_birth: "14-05-1990",
      mobile_number: "+254711000001",
    },
  },
  meta: { request_id: "req_synthetic_001", response_time_ms: 180 },
};

export const IDENTITY_ENVELOPE_NOT_FOUND: PelezaIdentityEnvelope = {
  status: "FAILED",
  code: "04",
  message: "No record found for supplied id_number",
  data: { person: null },
  meta: { request_id: "req_synthetic_002", response_time_ms: 95 },
};

export const BANK_ENVELOPE_ALICE: PelezaBankVerificationEnvelope = {
  status: "SUCCESS",
  code: "00",
  message: "OK",
  data: {
    account_number: "0011223344",
    account_name: "Alice Wanjiru Kamau",
    bank_code: "01",
  },
  meta: { request_id: "req_synthetic_003", response_time_ms: 210 },
};

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

export const CREDIT_ENVELOPE_ALICE: PelezaCreditEnvelope = {
  status: "SUCCESS",
  code: "00",
  message: "OK",
  data: {
    inquiries_7d: 0,
    distinct_recent_inquirers: 0,
    open_applications: 0,
    overdue_ratio: 0,
    worst_days_in_arrears: 0,
    report_status: "found",
  },
  meta: { request_id: "req_synthetic_006", response_time_ms: 230 },
};
