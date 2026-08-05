/**
 * RAW WIRE SHAPES — modeled on typical Peleza/IDM-style KYC envelopes
 * (status/code/data/meta wrapper, DD-MM-YYYY dates, split name parts), based
 * on common conventions for Kenyan identity-verification APIs.
 *
 * IMPORTANT: this was NOT checked against Peleza's live API reference in
 * this session — no network access, no vendor docs open here. Before wiring
 * a real HTTP call, reconcile every field name and the date format against
 * the actual contract (likely already known from the previous build). Until
 * then this exists to prove the parser/normalisation pipeline, not to be
 * trusted as the literal vendor schema.
 */

export interface PelezaMeta {
  request_id: string;
  response_time_ms: number;
}

export interface PelezaIdentityEnvelope {
  status: "SUCCESS" | "FAILED";
  code: string;
  message: string;
  data: {
    person: {
      id_number: string;
      id_status: "ACTIVE" | "VOID" | "NOT_FOUND";
      first_name: string | null;
      middle_name: string | null;
      last_name: string | null;
      gender: "MALE" | "FEMALE" | null;
      date_of_birth: string | null; // wire format: DD-MM-YYYY
      mobile_number: string | null;
    } | null;
  };
  meta: PelezaMeta;
}

export interface PelezaBankVerificationEnvelope {
  status: "SUCCESS" | "FAILED";
  code: string;
  message: string;
  data: {
    account_number: string;
    account_name: string | null;
    bank_code: string;
  } | null;
  meta: PelezaMeta;
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
 * Peleza itself is an identity vendor, not a credit bureau — in production
 * `getCredit` would very likely route to a separate adapter (e.g.
 * Creditinfo), composed alongside this one at the composition root. This
 * generic envelope shape lets PelezaProvider satisfy the full IdentityProvider
 * port for this stub, so the parity test can exercise the whole interface.
 */
export interface PelezaCreditEnvelope {
  status: "SUCCESS" | "FAILED";
  code: string;
  message: string;
  data: {
    inquiries_7d: number;
    distinct_recent_inquirers: number;
    open_applications: number;
    overdue_ratio: number;
    worst_days_in_arrears: number;
    report_status: "found" | "thin_file" | "not_found";
  } | null;
  meta: PelezaMeta;
}
