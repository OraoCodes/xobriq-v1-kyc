import type { DecisionRequest, RiskReason, SignalUsage, DecisionAction } from "@xobriq/shared";
import { planNextStep, type CascadeState } from "../domain/services/cascade-planner.js";
import { computeConfidence } from "../domain/services/confidence.js";
import { decideAction } from "../domain/services/decision-policy.js";
import type { SignalGatherer, PreparedContext } from "./signal-gatherer.js";
import type { EngineConfig } from "../infrastructure/config/engine-config.js";

export interface CascadeOutcome {
  action: DecisionAction;
  riskReasons: RiskReason[];
  score: number;
  confidence: number;
  signalsUsed: SignalUsage[];
}

/** The pure cascade loop: fetch tiers via the planner until it says decide, then score. */
export async function runCascade(
  gatherer: SignalGatherer,
  request: DecisionRequest,
  prepared: PreparedContext,
  config: EngineConfig,
): Promise<CascadeOutcome> {
  let state: CascadeState = { tier2aDone: false, tier2bDone: false, outcomes: prepared.outcomes };
  let features = prepared.features;
  let signalsUsed = prepared.signalsUsed;

  for (;;) {
    const step = planNextStep(state, config.thresholds);
    if (step.kind === "decide") break;
    const gathered = await gatherer.gatherTier(step.tier, request, prepared.identity);
    state = {
      tier2aDone: state.tier2aDone || step.tier === "2a",
      tier2bDone: state.tier2bDone || step.tier === "2b",
      outcomes: [...state.outcomes, ...gathered.outcomes],
    };
    features = { ...features, ...gathered.features };
    signalsUsed = [...signalsUsed, ...gathered.signalsUsed];
  }

  const confidence = computeConfidence(state.outcomes);
  const scored = config.scorer.evaluate(features);
  const action = decideAction({ hardRuleAction: null, score: scored.score, confidence, thresholds: config.thresholds });
  return { action, riskReasons: scored.contributions, score: scored.score, confidence, signalsUsed };
}
