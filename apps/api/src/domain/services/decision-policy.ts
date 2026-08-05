import type { DecisionAction } from "@xobriq/shared";

/**
 * The final decision policy — pure. Maps (hard-rule outcome, score, confidence)
 * to one of the four actions. Kept tiny and side-effect-free so it can be
 * exhaustively unit-tested. Thresholds are injected (from config, per event
 * type), never hard-coded here.
 *
 * Precedence:
 *   1. Hard rule fired          → its action (BLOCK) wins outright.
 *   2. Confidence below minimum → STEP_UP (never guess when unsure).
 *   3. Score at/above block bar  → BLOCK.
 *   4. Score at/below allow bar   → ALLOW.
 *   5. Otherwise                  → REVIEW (a human decides).
 */

export interface DecisionThresholds {
  block_threshold: number;
  allow_threshold: number;
  confidence_min: number;
}

export function decideAction(input: {
  hardRuleAction: DecisionAction | null;
  score: number;
  confidence: number;
  thresholds: DecisionThresholds;
}): DecisionAction {
  if (input.hardRuleAction) return input.hardRuleAction;

  const { block_threshold, allow_threshold, confidence_min } = input.thresholds;

  if (input.confidence < confidence_min) return "STEP_UP";
  if (input.score >= block_threshold) return "BLOCK";
  if (input.score <= allow_threshold) return "ALLOW";
  return "REVIEW";
}
