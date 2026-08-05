import type { Features } from "@xobriq/shared";
import type { IdentitySignal, CreditSignal } from "../domain/ports/identity-provider.js";

/**
 * Pure mapping from provider signals to the typed Feature vector, and the
 * cross-source name/date comparisons that turn two independently-sourced
 * values into a fraud signal. No I/O — kept separate from SignalGatherer so
 * the "how do two sources disagree" logic is testable on its own.
 */

function normaliseNameForCompare(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** null means "can't compare" (one side missing) — never treated as a match OR a mismatch. */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean | null {
  if (!a || !b) return null;
  return normaliseNameForCompare(a) === normaliseNameForCompare(b);
}

export function datesMatch(a: string | null | undefined, b: string | null | undefined): boolean | null {
  if (!a || !b) return null;
  return a === b;
}

export function computeAge(dob: string | null, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  let age = asOf.getUTCFullYear() - parsed.getUTCFullYear();
  const hadBirthdayThisYear =
    asOf.getUTCMonth() > parsed.getUTCMonth() ||
    (asOf.getUTCMonth() === parsed.getUTCMonth() && asOf.getUTCDate() >= parsed.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function identityFeatures(identity: IdentitySignal): Partial<Features> {
  return {
    "applicant.id_valid": identity.id_valid,
    "applicant.age": computeAge(identity.dob),
    "applicant.dob": identity.dob,
    "identity.full_name": identity.full_name,
  };
}

export function creditFeatures(credit: CreditSignal): Partial<Features> {
  return {
    "credit.inquiries_7d": credit.inquiries_7d,
    "credit.distinct_recent_inquirers": credit.distinct_recent_inquirers,
    "credit.open_applications": credit.open_applications,
    "credit.overdue_ratio": credit.overdue_ratio,
    "credit.worst_days_in_arrears": credit.worst_days_in_arrears,
    "credit.report_status": credit.report_status,
  };
}
