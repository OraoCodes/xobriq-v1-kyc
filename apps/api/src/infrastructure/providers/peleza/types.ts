/**
 * RAW WIRE SHAPES.
 *
 * PelezaKenyaIdEnvelope below is the REAL shape of Peleza's Kenya ID lookup
 * (`POST /api/v1/id/ke`) — confirmed against a live sandbox call, which is
 * more reliable than the paraphrased field list this was first drafted
 * from (that draft had the field names wrong: `data.name`/`data.dob`/
 * `data.valid` don't exist — the real response uses `full_name`/
 * `date_of_birth`/`is_valid`). The real response also carries a number of
 * biometric/registry fields (photo/signature URLs, clan, occupation, place
 * of birth, etc.) that aren't modeled here since nothing downstream needs
 * them — only what IdentitySignal actually consumes.
 *
 * PelezaBankAccountEnvelope (below) is also a real, non-legacy shape, but
 * unlike Kenya-ID it has NOT yet been confirmed against a live call — see
 * its own doc comment.
 *
 * KRA/driving-licence/credit are still the earlier MODELED status/code/
 * data/meta envelope, based on common conventions for Kenyan identity-
 * verification APIs, and were NOT checked against Peleza's live API
 * reference. Before wiring a real HTTP call for those, reconcile every
 * field name and the date format against the actual contract. Until then
 * they exist to prove the parser/normalisation pipeline, not to be trusted
 * as the literal vendor schema.
 */

export interface PelezaMeta {
  request_id: string;
  response_time_ms: number;
}

export interface PelezaKenyaIdData {
  id_number: string;
  first_name: string;
  last_name: string;
  other_name: string;
  full_name: string;
  gender: string; // observed values: "Male" | "Female"
  date_of_birth: string; // ISO 8601, e.g. "1988-03-15"
  date_of_death: string | null; // ISO 8601 when present — deceased-registry signal
  citizenship: string;
  verification_status: string; // e.g. "Valid"
  is_valid: boolean;
  pin: string | null; // KRA PIN embedded on the ID card — captured, not yet used by any rule
  has_photo: boolean;
  has_fingerprint: boolean;
  has_signature: boolean;
}

export interface PelezaKenyaIdEnvelope {
  success: boolean;
  response_code: number;
  message: string;
  country: string;
  data: PelezaKenyaIdData | null;
  request_id: string;
}

/**
 * PelezaBankAccountEnvelope — the real shape of Peleza's bank-account lookup
 * (`POST /api/v1/bank-account`). PROVISIONAL: drafted from documentation
 * text, not yet confirmed against a live call the way Kenya-ID was — the
 * Kenya-ID build found the documented field names wrong (`data.name` vs the
 * real `data.full_name`, etc.), so treat this shape as approximately right
 * on structure and possibly wrong on exact field names until the live test
 * (peleza-bank-account.live.test.ts) has actually run and confirmed it.
 */
export interface PelezaBankAccountData {
  account_number: string;
  bank: { id: number; name: string };
  account_holder: { name: string };
  status: string; // e.g. "verified"
  is_verified: boolean;
}

export interface PelezaBankAccountEnvelope {
  success: boolean;
  response_code: number;
  message: string;
  data: PelezaBankAccountData | null;
  request_id: string;
}

export interface PelezaKraEnvelope {
  status: "SUCCESS" | "FAILED";
  code: string;
  message: string;
  data: {
    kra_pin: string;
    taxpayer_name: string | null;
  } | null;
  meta: PelezaMeta;
}

export interface PelezaDrivingLicenceEnvelope {
  status: "SUCCESS" | "FAILED";
  code: string;
  message: string;
  data: {
    id_number: string;
    licence_number: string;
    date_of_birth: string | null; // wire format: DD-MM-YYYY
  } | null;
  meta: PelezaMeta;
}

/**
 * PelezaCreditInfoEnvelope — the real shape of Peleza's rich credit report
 * (`POST /api/v1/credit-info`, NOT the thinner `credit-score`). PROVISIONAL,
 * same caveat as bank-account: drafted from documentation text, not yet
 * confirmed live. Numeric-looking values (credit_score, balances) arrive as
 * STRINGS on the wire ("11390.80") — the parser, not this type, is
 * responsible for safe numeric parsing.
 *
 * Only the fields the parser actually consumes are typed precisely;
 * guarantors/stakeholders/lender_sector/bounced_cheques are real fields on
 * the documented response but aren't consumed (no calibrated fraud meaning
 * for them yet), so they're typed loosely rather than precisely modeled.
 */
export interface PelezaCreditEnquiryBucket {
  last_3_months: number;
  last_6_months: number;
  last_12_months: number;
}

export interface PelezaCreditAccountSummary {
  total_accounts: number;
  active_accounts: number;
  closed_accounts: number;
  total_outstanding_balance: string; // numeric string, e.g. "11390.80"
  total_overdue_balance: string;
}

export interface PelezaCreditAccountInfo {
  account_number: string;
  account_status: string;
  days_in_arrears: number;
  highest_days_in_arrears: number;
  delinquency_code: string;
  overdue_balance: string; // numeric string
  product_type_id: number;
}

export interface PelezaCreditInfoData {
  identity_number: string;
  identity_type: string;
  credit_score: string; // numeric string, e.g. "270.00"
  delinquency_code: string;
  has_fraud: boolean;
  is_guarantor: boolean;
  bounced_cheques?: PelezaCreditEnquiryBucket;
  credit_applications: PelezaCreditEnquiryBucket;
  enquiries: PelezaCreditEnquiryBucket;
  account_summary: PelezaCreditAccountSummary;
  account_info: PelezaCreditAccountInfo[] | null;
  guarantors?: unknown;
  stakeholders?: unknown;
}

export interface PelezaCreditInfoEnvelope {
  success: boolean;
  response_code: number;
  message: string;
  data: PelezaCreditInfoData | null;
  request_id: string;
}
