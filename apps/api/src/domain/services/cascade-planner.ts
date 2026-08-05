import { computeConfidence, type SignalOutcome } from "./confidence.js";

/**
 * THE CASCADE PLANNER — the review's Priority-1 fix.
 *
 * In the previous build, the tiering logic (which signals to fetch, when to
 * stop) was tangled inside a 256-line decide() method, interleaved with I/O,
 * and therefore untestable in isolation. Here it is a PURE FUNCTION: given
 * what we know so far, return the next step. No I/O, no side effects, fully
 * table-testable across every confidence/threshold combination.
 *
 * The cascade IS the business model: cheap signals first, expensive lookups
 * only when we're still unsure. Tier 0 (device/velocity/graph, free) is always
 * gathered before we get here. Tier 2a (credit, bank, KRA) fires for a
 * first-pass decision; Tier 2b (driving licence) only if 2a leaves us under
 * the confidence bar.
 */

export interface CascadeThresholds {
  /** Below this confidence, the decision is STEP_UP (too little evidence to act). */
  confidence_min: number;
  /** At/above this after Tier 2a, skip Tier 2b (driving licence). */
  tier2b_trigger_confidence: number;
}

export type CascadeTier = "2a" | "2b";

export interface CascadeState {
  tier2aDone: boolean;
  tier2bDone: boolean;
  /** Outcomes gathered so far, used to compute current confidence. */
  outcomes: readonly SignalOutcome[];
}

export type CascadeStep =
  | { kind: "fetch"; tier: CascadeTier }
  | { kind: "decide" };

/**
 * Decide the next step of the cascade. Pure — depends only on its arguments.
 *
 *   1. Tier 2a not yet run  → fetch 2a.
 *   2. 2a done, confidence still below the 2b trigger, 2b not run → fetch 2b.
 *   3. Otherwise → decide (we have enough, or there's nothing left to fetch).
 */
export function planNextStep(state: CascadeState, thresholds: CascadeThresholds): CascadeStep {
  if (!state.tier2aDone) {
    return { kind: "fetch", tier: "2a" };
  }

  const confidence = computeConfidence(state.outcomes);
  if (confidence < thresholds.tier2b_trigger_confidence && !state.tier2bDone) {
    return { kind: "fetch", tier: "2b" };
  }

  return { kind: "decide" };
}
