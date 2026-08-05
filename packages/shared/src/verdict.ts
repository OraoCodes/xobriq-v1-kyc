/**
 * The verdict language — the four decisions Xobriq can return. Defined once
 * here and imported by both the API (which produces them) and the portal
 * (which renders them), so the two can never disagree on the vocabulary.
 */

export type DecisionAction = "ALLOW" | "BLOCK" | "REVIEW" | "STEP_UP";

export type RiskBand = "low" | "moderate" | "elevated" | "critical";

/**
 * Where a decision originated. `api` = a lender's system called us
 * (the automated path). `manual` = a human ran the check from the portal.
 * This is persisted and audited so manual, human-initiated checks never get
 * conflated with real automated loan decisions in metrics or compliance
 * reports. Defaults to `api` everywhere it isn't explicitly set to `manual`.
 */
export type InitiatedBy = "api" | "manual";

/** Maps a 0–1000 risk score to its band. Single definition, shared. */
export function riskBandFor(score: number): RiskBand {
  if (score >= 720) return "critical";
  if (score >= 520) return "elevated";
  if (score >= 380) return "moderate";
  return "low";
}

/**
 * Verdict colour tokens — the semantic colour for each action. Consumed by
 * the portal's theme so the four-colour system (allow/step-up/review/block)
 * is defined once. Colour is always paired with a text label in the UI,
 * never used alone (accessibility).
 */
export const VERDICT_COLORS: Record<DecisionAction, string> = {
  ALLOW: "#1F9D6B", // green
  STEP_UP: "#C98A1B", // amber
  REVIEW: "#7A5AF8", // violet
  BLOCK: "#D64550", // red
};
