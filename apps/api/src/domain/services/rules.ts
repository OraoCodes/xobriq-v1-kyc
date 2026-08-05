import type { RiskReason, DecisionAction } from "@xobriq/shared";

/**
 * Hard rules — deterministic, non-negotiable constraints that run BEFORE the
 * scorer and override it. These encode policy/legal absolutes, not
 * probability: an invalid identity or an under-18 applicant is a BLOCK
 * regardless of how low the risk score is. Kept separate from the weighted
 * scorer so a strong "decrease risk" signal can never accidentally cancel a
 * hard block. Sanctions/PEP is a stubbed seam for MVP.
 */

export interface HardRuleInput {
  identityValid: boolean | null;
  applicantAge: number | null;
  sanctionsHit?: boolean;
}

export interface HardRuleVerdict {
  action: DecisionAction;
  reasons: RiskReason[];
}

function block(reason: RiskReason): HardRuleVerdict {
  return { action: "BLOCK", reasons: [reason] };
}

export function applyHardRules(input: HardRuleInput): HardRuleVerdict | null {
  if (input.identityValid !== true) {
    return block({
      code: "IDENTITY_NOT_VERIFIED",
      category: "identity",
      weight: 1000,
      direction: "increases_risk",
      severity: "critical",
      evidence: { identity_valid: input.identityValid },
    });
  }

  if (input.sanctionsHit) {
    return block({
      code: "SANCTIONS_PEP_HIT",
      category: "compliance",
      weight: 1000,
      direction: "increases_risk",
      severity: "critical",
      evidence: { sanctions_hit: true },
    });
  }

  if (input.applicantAge !== null && input.applicantAge < 18) {
    return block({
      code: "APPLICANT_UNDER_18",
      category: "identity",
      weight: 1000,
      direction: "increases_risk",
      severity: "critical",
      evidence: { age: input.applicantAge },
    });
  }

  return null;
}
