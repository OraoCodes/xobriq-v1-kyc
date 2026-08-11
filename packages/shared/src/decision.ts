/**
 * THE CONTRACT.
 *
 * This is the single source of truth for the shape of a decision request and
 * response. The API's endpoint produces exactly `DecisionResponse`; the
 * portal renders exactly `DecisionResponse`. Neither side hand-copies the
 * shape — they both import it from here. This is the entire reason the
 * project is a monorepo: the contract cannot drift.
 */

import type { DecisionAction, RiskBand, InitiatedBy } from "./verdict.js";

// ---- Request ----

export interface DisbursementAccount {
  account_name?: string; // powers the mule / name-mismatch signal
  account_number?: string;
  /** Peleza bank id (see banks.ts / BANKS) — required to actually run the bank check. */
  bank_id?: number;
}

export interface DecisionRequest {
  event_type: "loan_application";
  reference_id?: string;
  subject: {
    national_id: string;
    phone?: string;
  };
  event_data?: {
    amount?: number;
    currency?: string;
    disbursement_account?: DisbursementAccount;
    /** KRA PIN — powers the xcheck.kra_name_match signal. */
    kra_pin?: string;
  };
  /** Honest provenance. `manual` for portal-initiated checks, else `api`. */
  initiated_by: InitiatedBy;
  /** Operator id/email for manual checks; absent for api-initiated. */
  initiated_by_user?: string;
  device?: {
    fingerprint?: string;
    session_token?: string;
  };
}

// ---- Response building blocks ----

export type RiskDirection = "increases_risk" | "decreases_risk";
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface RiskReason {
  code: string;
  category: string;
  /** Signed: positive raises risk, negative lowers it. */
  weight: number;
  direction: RiskDirection;
  severity: Severity;
  evidence: Record<string, unknown>;
}

export type SignalStatus = "success" | "not_found" | "timeout" | "error" | "skipped";

export interface SignalUsage {
  source: string;
  status: SignalStatus;
  latency_ms: number | null;
  cost_tier: 0 | 1 | 2;
  reason?: string;
}

export interface StepUpOption {
  method: string;
  expected_confidence_gain: number;
}

export interface DecisionExplanation {
  human: string;
  machine: {
    primary_driver: string | null;
    risk_categories: Record<string, number>;
    model_version: string;
  };
}

export interface DecisionEntity {
  id: string;
  is_new: boolean;
  lifetime_decisions: number;
}

// ---- Response ----

export interface DecisionResponse {
  id: string;
  object: "decision";
  created_at: string;
  event_type: string;
  reference_id: string | null;
  initiated_by: InitiatedBy;
  /**
   * Which provider actually answered this decision: "test" (MockProvider,
   * synthetic personas, free) or "live" (real Peleza, real cost/PII).
   * Attached at the HTTP layer when the response is built, not persisted —
   * a decision fetched later via history/review won't carry this field.
   */
  mode?: "test" | "live";
  recommended_action: DecisionAction;
  risk_score: number; // 0–1000
  risk_band: RiskBand;
  confidence_score: number; // 0–100
  risk_reasons: RiskReason[]; // sorted by |weight| desc
  explanation: DecisionExplanation;
  step_up_options: StepUpOption[];
  signals_used: SignalUsage[];
  entity: DecisionEntity;
  audit_id: string;
  latency_ms: number;
}

// ---- Feedback ----

export type FeedbackOutcome =
  | "confirmed_fraud"
  | "confirmed_legitimate"
  | "false_positive"
  | "suspected_fraud";

export interface FeedbackRequest {
  outcome: FeedbackOutcome;
  fraud_type?: string;
  loss_amount?: number;
}
