import { WeightedEvidenceScorer, validateWeightsConfig, type WeightsConfig, type Scorer } from "../../domain/services/scorer.js";
import type { DecisionThresholds } from "../../domain/services/decision-policy.js";
import type { CascadeThresholds } from "../../domain/services/cascade-planner.js";

/**
 * Config is loaded once and cached — never re-read from disk on the request
 * path (FOUNDATION §3.2). `refreshConfig()` is the explicit reload seam
 * (an admin action/SIGHUP), not something the hot path ever calls.
 */
export interface EngineConfig {
  weights: WeightsConfig;
  scorer: Scorer;
  thresholds: DecisionThresholds & CascadeThresholds;
}

const WEIGHTS: WeightsConfig = {
  version: "v1",
  base_score: 200,
  rules: [
    {
      code: "ID_VALID",
      category: "identity",
      weight: -50,
      severity: "info",
      when: { feature: "applicant.id_valid", equals: true },
      evidence: ["applicant.id_valid"],
    },
    {
      code: "DEVICE_SHARED",
      category: "device",
      weight: 260,
      severity: "high",
      when: { feature: "device.reuse_count_30d", gte: 5 },
      evidence: ["device.reuse_count_30d"],
    },
    {
      code: "BANK_NAME_MISMATCH",
      category: "identity",
      weight: 450,
      severity: "high",
      when: { feature: "xcheck.bank_name_match", equals: false },
      evidence: ["xcheck.bank_name_match"],
    },
    {
      code: "CREDIT_INQUIRIES_ELEVATED",
      category: "credit",
      weight: 150,
      severity: "medium",
      when: { feature: "credit.inquiries_7d", gte: 3 },
      evidence: ["credit.inquiries_7d"],
    },
    // The three rules below are NEW, added when the real Peleza credit-info
    // adapter shipped. Peleza can't honestly answer "how many in 7 days" (it
    // only exposes 3/6/12-month buckets), so these are separate, honestly
    // named rules rather than overloading CREDIT_INQUIRIES_ELEVATED above —
    // that rule stays exactly as-is and keeps firing off MockProvider's own
    // synthetic inquiries_7d. WEIGHTS BELOW ARE UNVALIDATED GUESSES, not
    // calibrated against real loss data — flagged for review, not a
    // confident recommendation.
    {
      code: "CREDIT_APPLICATIONS_ELEVATED_3M",
      category: "credit",
      weight: 80, // guess: same count as the 7d rule but over a 6x longer window reads as materially less urgent
      severity: "medium",
      when: { feature: "credit.applications_3m", gte: 3 },
      evidence: ["credit.applications_3m"],
    },
    {
      code: "CREDIT_SEVERE_ARREARS",
      category: "credit",
      weight: 300, // guess: 90+ days past due is a conventional bureau "seriously delinquent" threshold
      severity: "high",
      when: { feature: "credit.worst_days_in_arrears", gte: 90 },
      evidence: ["credit.worst_days_in_arrears"],
    },
    {
      code: "CREDIT_HAS_FRAUD_FLAG",
      category: "credit",
      weight: 550, // guess: a bureau-confirmed fraud flag is severe but this isn't (yet) a categorical hard rule like sanctions/deceased
      severity: "critical",
      when: { feature: "credit.has_fraud", equals: true },
      evidence: ["credit.has_fraud"],
    },
    {
      code: "GRAPH_ENTITY_FLAGGED",
      category: "graph",
      weight: 600,
      severity: "critical",
      when: { feature: "graph.entity_flagged", equals: true },
      evidence: ["graph.entity_flagged"],
    },
    {
      code: "THIN_CREDIT_FILE",
      category: "credit",
      weight: 40,
      severity: "low",
      when: { feature: "credit.report_status", equals: "thin_file" },
      evidence: ["credit.report_status"],
    },
  ],
};

const THRESHOLDS: DecisionThresholds & CascadeThresholds = {
  block_threshold: 720,
  allow_threshold: 380,
  confidence_min: 70,
  tier2b_trigger_confidence: 80,
};

function buildConfig(): EngineConfig {
  validateWeightsConfig(WEIGHTS);
  return { weights: WEIGHTS, scorer: new WeightedEvidenceScorer(WEIGHTS), thresholds: THRESHOLDS };
}

let cached = buildConfig();

export function getEngineConfig(): EngineConfig {
  return cached;
}

export function refreshConfig(): void {
  cached = buildConfig();
}
