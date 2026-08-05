import type { RiskReason, SignalUsage } from "@xobriq/shared";

export type EvidenceStatus = "pass" | "warn" | "fail" | "unavailable";

export interface EvidenceItem {
  key: string;
  label: string;
  status: EvidenceStatus;
  detail: string;
}

/** The calm grid of key checks — derived from risk_reasons + signals_used, never a separate source of truth. */
export function buildEvidencePack(decision: { risk_reasons: RiskReason[]; signals_used: SignalUsage[] }): EvidenceItem[] {
  const reason = new Map(decision.risk_reasons.map((r) => [r.code, r]));
  const signal = new Map(decision.signals_used.map((s) => [s.source, s]));

  const identityInvalid = reason.get("IDENTITY_NOT_VERIFIED");
  const identitySignal = signal.get("iprs_identity");
  const bankMismatch = reason.get("BANK_NAME_MISMATCH");
  const bankSignal = signal.get("bank_verification");
  const inquiriesElevated = reason.get("CREDIT_INQUIRIES_ELEVATED");
  const creditSignal = signal.get("credit_bureau");
  const deviceShared = reason.get("DEVICE_SHARED");
  const flagged = reason.get("GRAPH_ENTITY_FLAGGED");

  const items: EvidenceItem[] = [
    {
      key: "identity",
      label: "Identity · IPRS",
      status: identityInvalid ? "fail" : identitySignal?.status === "success" ? "pass" : "unavailable",
      detail: identityInvalid ? "Could not verify against the national registry" : "Matches the national registry",
    },
    {
      key: "bank",
      label: "Payout account name",
      status: bankMismatch
        ? "fail"
        : bankSignal?.status === "success"
          ? "pass"
          : bankSignal?.status === "skipped"
            ? "unavailable"
            : "warn",
      detail: bankMismatch
        ? "Doesn't match the applicant's name"
        : bankSignal?.status === "success"
          ? "Matches the applicant's name"
          : bankSignal?.status === "skipped"
            ? "No payout account provided"
            : "Couldn't be checked",
    },
    {
      key: "credit",
      label: "Credit-inquiry activity",
      status: inquiriesElevated ? "warn" : creditSignal?.status === "success" ? "pass" : "unavailable",
      detail: inquiriesElevated
        ? `${inquiriesElevated.evidence["credit.inquiries_7d"]} inquiries in the last 7 days`
        : creditSignal?.status === "success"
          ? "No unusual inquiry activity"
          : creditSignal?.status === "timeout"
            ? "Credit bureau timed out — decided at reduced confidence"
            : "Not checked — the identity check failed first",
    },
    {
      key: "device",
      label: "Device & network",
      status: deviceShared ? "warn" : "pass",
      detail: deviceShared
        ? `Shared with ${deviceShared.evidence["device.reuse_count_30d"]} other applicants in 30 days`
        : "No unusual device activity",
    },
    {
      key: "consortium",
      label: "Consortium check",
      status: flagged ? "fail" : "pass",
      detail: flagged ? "Linked to a confirmed fraud flag" : "No links to flagged identities",
    },
  ];

  return items;
}
