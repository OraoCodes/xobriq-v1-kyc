import type { ProviderResult, IdentitySignal, CreditSignal } from "../../../domain/ports/identity-provider.js";
import type {
  PelezaKenyaIdEnvelope,
  PelezaNationalIdEnvelope,
  PelezaBankAccountEnvelope,
  PelezaKraEnvelope,
  PelezaDrivingLicenceEnvelope,
  PelezaCreditInfoEnvelope,
} from "./types.js";

/**
 * NORMALISATION — the real work. Every value crossing this boundary is
 * translated into the vendor-neutral shape ONCE, here, so nothing downstream
 * ever parses a wire format or learns a vendor's conventions.
 */

/** Peleza/IDM wire dates are DD-MM-YYYY, not ISO. */
function normaliseWireDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/** Peleza's Kenya-ID gender values ("Male"/"Female") → the port's single-letter convention (matches MockProvider). */
function normaliseKenyaIdGender(raw: string): string | null {
  const normalised = raw.trim().toLowerCase();
  if (normalised === "male") return "M";
  if (normalised === "female") return "F";
  return null;
}

/**
 * Pure mapping from a successfully-fetched Kenya-ID envelope to the
 * vendor-neutral IdentitySignal. Assumes the envelope came from a 200
 * response — HTTP-level failures (404/402/429/etc.) are classified by the
 * adapter before this is ever called. Returns null when the envelope itself
 * reports no match (`success: false` or a missing `data`), which the
 * adapter treats as not_found.
 */
export function parseKenyaIdSignal(envelope: PelezaKenyaIdEnvelope): IdentitySignal | null {
  if (!envelope.success || !envelope.data) return null;

  const d = envelope.data;
  return {
    id_valid: d.is_valid,
    full_name: d.full_name,
    dob: d.date_of_birth,
    gender: normaliseKenyaIdGender(d.gender),
    date_of_death: d.date_of_death,
    pin: d.pin,
    has_photo: d.has_photo,
    has_fingerprint: d.has_fingerprint,
    has_signature: d.has_signature,
  };
}

/**
 * Pure mapping from a successfully-fetched national-id envelope (the
 * PRODUCTION identity fallback — see types.ts's doc comment) to the
 * vendor-neutral IdentitySignal. Deliberately does NOT populate
 * date_of_death/pin/has_photo/has_fingerprint/has_signature — this
 * endpoint's response has no equivalent fields, and leaving them unset is
 * more honest than guessing. This means the deceased hard-rule cannot fire
 * from a national-id-sourced identity signal.
 */
export function parseNationalIdSignal(envelope: PelezaNationalIdEnvelope): IdentitySignal | null {
  if (!envelope.success || !envelope.data) return null;

  const d = envelope.data;
  return {
    id_valid: d.valid,
    full_name: d.name,
    dob: d.dob,
    gender: normaliseKenyaIdGender(d.gender),
  };
}

/**
 * Pure mapping from a successfully-fetched bank-account envelope to the
 * narrow fragment the domain's bank cross-check consumes. `is_verified` is
 * read but deliberately not used to gate the result — the cross-check
 * exists to compare Peleza's account-holder name against IPRS independently
 * of Peleza's own verification confidence, so gating on it would suppress
 * evidence rather than use it.
 */
export function parseBankAccountSignal(
  envelope: PelezaBankAccountEnvelope,
): Pick<IdentitySignal, "bank_account_name"> | null {
  const name = envelope.data?.account_holder?.name;
  if (!envelope.success || !name) return null;
  return { bank_account_name: name };
}

export function parseKraEnvelope(
  envelope: PelezaKraEnvelope,
): ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">> {
  const latencyMs = envelope.meta.response_time_ms;
  if (envelope.status !== "SUCCESS" || !envelope.data) {
    return { status: "not_found", data: null, latencyMs };
  }
  return { status: "success", data: { kra_taxpayer_name: envelope.data.taxpayer_name }, latencyMs };
}

export function parseDrivingLicenceEnvelope(
  envelope: PelezaDrivingLicenceEnvelope,
): ProviderResult<Pick<IdentitySignal, "dl_dob">> {
  const latencyMs = envelope.meta.response_time_ms;
  if (envelope.status !== "SUCCESS" || !envelope.data) {
    return { status: "not_found", data: null, latencyMs };
  }
  return { status: "success", data: { dl_dob: normaliseWireDate(envelope.data.date_of_birth) }, latencyMs };
}

/** Peleza returns numeric values as strings ("11390.80") — parse safely, defaulting to 0 rather than throwing or propagating NaN. */
function parseNumericString(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pure mapping from a successfully-fetched credit-info envelope to the
 * vendor-neutral CreditSignal. Deliberately does NOT populate inquiries_7d /
 * distinct_recent_inquirers — Peleza only exposes 3/6/12-month buckets, and
 * fabricating a 7-day count from a 3-month one would misrepresent the data
 * to the scorer. inquiries_3m / applications_3m carry Peleza's own honest
 * granularity instead (see CreditSignal's doc comments).
 */
export function parseCreditInfoSignal(envelope: PelezaCreditInfoEnvelope): CreditSignal | null {
  if (!envelope.success || !envelope.data) return null;
  const d = envelope.data;

  const totalOutstanding = parseNumericString(d.account_summary?.total_outstanding_balance);
  const totalOverdue = parseNumericString(d.account_summary?.total_overdue_balance);
  const overdueRatio = totalOutstanding > 0 ? totalOverdue / totalOutstanding : 0;

  const worstDaysInArrears = (d.account_info ?? []).reduce(
    (max, account) => Math.max(max, account.highest_days_in_arrears ?? 0),
    0,
  );

  const totalAccounts = d.account_summary?.total_accounts ?? 0;
  const reportStatus: CreditSignal["report_status"] = totalAccounts === 0 ? "thin_file" : "found";

  const signal: CreditSignal = {
    open_applications: d.account_summary?.active_accounts ?? 0,
    overdue_ratio: overdueRatio,
    worst_days_in_arrears: worstDaysInArrears,
    report_status: reportStatus,
  };
  if (d.enquiries?.last_3_months !== undefined) signal.inquiries_3m = d.enquiries.last_3_months;
  if (d.credit_applications?.last_3_months !== undefined) signal.applications_3m = d.credit_applications.last_3_months;
  if (d.has_fraud !== undefined) signal.has_fraud = d.has_fraud;

  return signal;
}
