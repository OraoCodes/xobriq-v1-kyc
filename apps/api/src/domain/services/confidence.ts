/**
 * Confidence reflects how much evidence the cascade actually GATHERED, not how
 * favourable that evidence was. This is the subtle, important distinction the
 * previous build got right and we keep:
 *
 *   - A resolved-but-mismatched signal RAISES confidence — we now know
 *     something concrete (a bank-name mismatch is real evidence, so it should
 *     land as a confident BLOCK/REVIEW, not a mushy "we're not sure" STEP_UP).
 *   - A timeout / not-found LOWERS confidence — it tells us nothing.
 *
 * Confidence drives the cascade (whether to fetch more) and the STEP_UP branch
 * (too little evidence → ask for more rather than guess).
 */

export type SignalKey = "credit" | "bank" | "kra" | "dl" | "graph";
export type SignalOutcomeStatus = "success" | "not_found" | "timeout" | "error" | "skipped";

export interface SignalOutcome {
  key: SignalKey;
  status: SignalOutcomeStatus;
  /** Meaningful only when status === "success": did the cross-check disagree with IPRS? */
  mismatch?: boolean;
}

// IPRS resolved + Tier-0 device/velocity/graph form the baseline. Tier 0 never
// "fails" — an empty history is itself a definitive answer — so it is part of
// the baseline, not a bonus.
const BASE_CONFIDENCE = 55;

// A confirmed consortium fraud flag is unambiguous, high-quality evidence in
// its own right, so it is weighted heavily and must not be a thin credit/KRA
// file away from being demoted to STEP_UP.
const SUCCESS_BONUS: Record<SignalKey, number> = { credit: 20, bank: 20, kra: 10, dl: 10, graph: 40 };
const MISMATCH_PENALTY = 15;
const NOT_FOUND_PENALTY = 8;
const FAILURE_PENALTY = 15;

export function computeConfidence(outcomes: readonly SignalOutcome[]): number {
  let confidence = BASE_CONFIDENCE;

  for (const outcome of outcomes) {
    switch (outcome.status) {
      case "success":
        confidence += SUCCESS_BONUS[outcome.key];
        if (outcome.mismatch) confidence -= MISMATCH_PENALTY;
        break;
      case "not_found":
        confidence -= NOT_FOUND_PENALTY;
        break;
      case "timeout":
      case "error":
        confidence -= FAILURE_PENALTY;
        break;
      case "skipped":
        break;
    }
  }

  return Math.min(100, Math.max(0, confidence));
}
