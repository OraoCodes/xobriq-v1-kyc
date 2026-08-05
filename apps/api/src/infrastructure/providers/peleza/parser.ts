import type { ProviderResult, IdentitySignal, CreditSignal } from "../../../domain/ports/identity-provider.js";
import type {
  PelezaIdentityEnvelope,
  PelezaBankVerificationEnvelope,
  PelezaKraEnvelope,
  PelezaDrivingLicenceEnvelope,
  PelezaCreditEnvelope,
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

/** Names arrive as separate parts; the domain reasons about one full_name. */
function joinName(parts: ReadonlyArray<string | null>): string | null {
  const joined = parts
    .filter((p): p is string => p !== null && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
  return joined.length > 0 ? joined : null;
}

function normaliseGender(raw: "MALE" | "FEMALE" | null): string | null {
  if (raw === "MALE") return "M";
  if (raw === "FEMALE") return "F";
  return null;
}

export function parseIdentityEnvelope(envelope: PelezaIdentityEnvelope): ProviderResult<IdentitySignal> {
  const latencyMs = envelope.meta.response_time_ms;
  if (envelope.status !== "SUCCESS" || !envelope.data.person) {
    return { status: "not_found", data: null, latencyMs };
  }

  const person = envelope.data.person;
  const signal: IdentitySignal = {
    id_valid: person.id_status === "ACTIVE",
    full_name: joinName([person.first_name, person.middle_name, person.last_name]),
    dob: normaliseWireDate(person.date_of_birth),
    gender: normaliseGender(person.gender),
  };
  if (person.mobile_number) signal.phone_on_record = person.mobile_number;

  return { status: "success", data: signal, latencyMs };
}

export function parseBankEnvelope(
  envelope: PelezaBankVerificationEnvelope,
): ProviderResult<Pick<IdentitySignal, "bank_account_name">> {
  const latencyMs = envelope.meta.response_time_ms;
  if (envelope.status !== "SUCCESS" || !envelope.data) {
    return { status: "not_found", data: null, latencyMs };
  }
  return { status: "success", data: { bank_account_name: envelope.data.account_name }, latencyMs };
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

export function parseCreditEnvelope(envelope: PelezaCreditEnvelope): ProviderResult<CreditSignal> {
  const latencyMs = envelope.meta.response_time_ms;
  if (envelope.status !== "SUCCESS" || !envelope.data) {
    return { status: "not_found", data: null, latencyMs };
  }
  const d = envelope.data;
  return {
    status: "success",
    data: {
      inquiries_7d: d.inquiries_7d,
      distinct_recent_inquirers: d.distinct_recent_inquirers,
      open_applications: d.open_applications,
      overdue_ratio: d.overdue_ratio,
      worst_days_in_arrears: d.worst_days_in_arrears,
      report_status: d.report_status,
    },
    latencyMs,
  };
}
