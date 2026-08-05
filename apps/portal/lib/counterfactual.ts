import type { RiskReason, DecisionAction } from "@xobriq/shared";

/**
 * THE product sentence. Turns risk_reasons into the plain-language claim a
 * credit officer can repeat to their boss. Pure — derived only from what the
 * API already returned, never a second source of truth about risk.
 *
 * Tone is derived from the VERDICT first, reasons second — a risk-raising
 * reason must never produce alarming copy under a green ALLOW stamp. Each
 * verdict has its own register: ALLOW reassures, REVIEW/STEP_UP names the
 * tension ("but"), BLOCK states the decisive reason plainly (no hedge).
 */

function reasonPhrase(reason: RiskReason): string | null {
  switch (reason.code) {
    case "BANK_NAME_MISMATCH":
      return "the payout account isn't theirs";
    case "CREDIT_INQUIRIES_ELEVATED": {
      const n = reason.evidence["credit.inquiries_7d"];
      return `${typeof n === "number" ? n : "several"} other lenders checked this person in the last week`;
    }
    case "DEVICE_SHARED": {
      const n = reason.evidence["device.reuse_count_30d"];
      return `this device has been used by ${typeof n === "number" ? n : "several"} other applicants this month`;
    }
    case "GRAPH_ENTITY_FLAGGED":
      return "they're linked to confirmed fraud elsewhere";
    case "THIN_CREDIT_FILE":
      return "there's very little history to go on";
    default:
      return null;
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function joinPhrases(phrases: string[]): string {
  return phrases.length === 2 ? `${phrases[0]}, and ${phrases[1]}` : phrases[0]!;
}

export function buildCounterfactual(decision: {
  recommended_action: DecisionAction;
  risk_reasons: RiskReason[];
}): string {
  // Hard-rule short-circuits are always decisive, regardless of verdict framing below (they're always BLOCK).
  const identityInvalid = decision.risk_reasons.find((r) => r.code === "IDENTITY_NOT_VERIFIED");
  if (identityInvalid) return "This identity could not be verified against the national registry.";

  const underage = decision.risk_reasons.find((r) => r.code === "APPLICANT_UNDER_18");
  if (underage) return "This applicant is under 18 — lending isn't permitted.";

  const sanctions = decision.risk_reasons.find((r) => r.code === "SANCTIONS_PEP_HIT");
  if (sanctions) return "This applicant matched a sanctions or politically-exposed-persons list.";

  const negativePhrases = decision.risk_reasons
    .filter((r) => r.direction === "increases_risk")
    .map(reasonPhrase)
    .filter((phrase): phrase is string => phrase !== null)
    .slice(0, 2);

  switch (decision.recommended_action) {
    case "ALLOW":
      if (negativePhrases.length === 0) {
        return "Identity checks out, and nothing unusual came up.";
      }
      // A risk-raising reason exists but didn't tip the scale — context, not alarm.
      return `Identity checks out. There's a little context worth knowing — ${joinPhrases(negativePhrases)} — but nothing that changes the picture.`;

    case "STEP_UP":
      if (negativePhrases.length === 0) {
        return "This identity is valid, but there isn't enough evidence yet to be confident either way.";
      }
      return `This identity is valid, but ${joinPhrases(negativePhrases)}.`;

    case "REVIEW":
      if (negativePhrases.length === 0) {
        return "This identity is valid, but the overall picture needs a second look.";
      }
      return `This identity is valid, but ${joinPhrases(negativePhrases)}.`;

    case "BLOCK":
      if (negativePhrases.length === 0) {
        return "This application is blocked based on the evidence gathered.";
      }
      return `${capitalize(joinPhrases(negativePhrases))}.`;
  }
}
