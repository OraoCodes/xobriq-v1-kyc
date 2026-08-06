import { describe, it, expect } from "vitest";
import { planNextStep, type CascadeState, type CascadeThresholds } from "../src/domain/services/cascade-planner.js";
import { decideAction } from "../src/domain/services/decision-policy.js";
import { computeConfidence } from "../src/domain/services/confidence.js";
import { WeightedEvidenceScorer, validateWeightsConfig, type WeightsConfig } from "../src/domain/services/scorer.js";
import { applyHardRules } from "../src/domain/services/rules.js";

const thresholds: CascadeThresholds = { confidence_min: 50, tier2b_trigger_confidence: 75 };

describe("cascade planner (pure — the Priority-1 extraction)", () => {
  it("fetches Tier 2a first when nothing has run", () => {
    const state: CascadeState = { tier2aDone: false, tier2bDone: false, outcomes: [] };
    expect(planNextStep(state, thresholds)).toEqual({ kind: "fetch", tier: "2a" });
  });

  it("fetches Tier 2b when 2a done but confidence still below the trigger", () => {
    // credit success (+20) on top of base 55 = 75... use a thinner outcome set to stay under 75
    const state: CascadeState = {
      tier2aDone: true,
      tier2bDone: false,
      outcomes: [{ key: "kra", status: "not_found" }], // 55 - 8 = 47 < 75
    };
    expect(planNextStep(state, thresholds)).toEqual({ kind: "fetch", tier: "2b" });
  });

  it("decides when confidence is already sufficient after 2a", () => {
    const state: CascadeState = {
      tier2aDone: true,
      tier2bDone: false,
      // graph hit (+40) + credit (+20) + bank (+20) = 135 -> clamped, well over 75
      outcomes: [
        { key: "graph", status: "success" },
        { key: "credit", status: "success" },
        { key: "bank", status: "success" },
      ],
    };
    expect(planNextStep(state, thresholds)).toEqual({ kind: "decide" });
  });

  it("decides once 2b has already run, regardless of confidence", () => {
    const state: CascadeState = {
      tier2aDone: true,
      tier2bDone: true,
      outcomes: [{ key: "kra", status: "not_found" }],
    };
    expect(planNextStep(state, thresholds)).toEqual({ kind: "decide" });
  });
});

describe("decision policy (pure)", () => {
  const t = { block_threshold: 720, allow_threshold: 380, confidence_min: 50 };

  it("hard-rule action wins outright", () => {
    expect(decideAction({ hardRuleAction: "BLOCK", score: 100, confidence: 99, thresholds: t })).toBe("BLOCK");
  });
  it("low confidence yields STEP_UP even at a low score", () => {
    expect(decideAction({ hardRuleAction: null, score: 200, confidence: 40, thresholds: t })).toBe("STEP_UP");
  });
  it("high score yields BLOCK", () => {
    expect(decideAction({ hardRuleAction: null, score: 800, confidence: 90, thresholds: t })).toBe("BLOCK");
  });
  it("low score yields ALLOW", () => {
    expect(decideAction({ hardRuleAction: null, score: 300, confidence: 90, thresholds: t })).toBe("ALLOW");
  });
  it("mid score yields REVIEW", () => {
    expect(decideAction({ hardRuleAction: null, score: 500, confidence: 90, thresholds: t })).toBe("REVIEW");
  });
});

describe("confidence (evidence-coverage)", () => {
  it("a resolved-but-mismatched signal still raises confidence over the empty baseline", () => {
    const withMismatch = computeConfidence([{ key: "bank", status: "success", mismatch: true }]);
    const empty = computeConfidence([]);
    expect(withMismatch).toBeGreaterThan(empty); // +20 -15 = +5 net, still above base
  });
  it("a timeout lowers confidence below baseline", () => {
    expect(computeConfidence([{ key: "credit", status: "timeout" }])).toBeLessThan(computeConfidence([]));
  });
  it("a consortium graph hit is weighted heavily", () => {
    expect(computeConfidence([{ key: "graph", status: "success" }])).toBeGreaterThanOrEqual(95);
  });
});

describe("hard rules", () => {
  it("invalid identity → BLOCK", () => {
    expect(applyHardRules({ identityValid: false, applicantAge: 30 })?.action).toBe("BLOCK");
  });
  it("under 18 → BLOCK", () => {
    expect(applyHardRules({ identityValid: true, applicantAge: 16 })?.action).toBe("BLOCK");
  });
  it("valid adult → no hard rule", () => {
    expect(applyHardRules({ identityValid: true, applicantAge: 30 })).toBeNull();
  });
  it("a non-null date_of_death → BLOCK with IDENTITY_DECEASED", () => {
    const verdict = applyHardRules({ identityValid: true, applicantAge: 30, dateOfDeath: "2020-01-01" });
    expect(verdict?.action).toBe("BLOCK");
    expect(verdict?.reasons[0]?.code).toBe("IDENTITY_DECEASED");
  });
  it("a null date_of_death → no deceased rule (falls through to no hard rule for an otherwise-clean adult)", () => {
    expect(applyHardRules({ identityValid: true, applicantAge: 30, dateOfDeath: null })).toBeNull();
  });
});

describe("scorer config validation (feature-registry guard)", () => {
  it("rejects a config referencing an unknown feature key", () => {
    const bad: WeightsConfig = {
      version: "test",
      base_score: 500,
      rules: [
        { code: "X", category: "device", weight: 10, severity: "low", when: { feature: "device.not_a_real_key", equals: true }, evidence: [] },
      ],
    };
    expect(() => validateWeightsConfig(bad)).toThrow(/unknown feature keys/);
  });

  it("scores additively and ranks reasons by absolute weight", () => {
    const config: WeightsConfig = {
      version: "test-1",
      base_score: 500,
      rules: [
        { code: "ID_OK", category: "identity", weight: -100, severity: "info", when: { feature: "applicant.id_valid", equals: true }, evidence: ["applicant.id_valid"] },
        { code: "DEVICE_SHARED", category: "device", weight: 187, severity: "high", when: { feature: "device.reuse_count_30d", gte: 5 }, evidence: ["device.reuse_count_30d"] },
      ],
    };
    const scorer = new WeightedEvidenceScorer(config);
    const result = scorer.evaluate({ "applicant.id_valid": true, "device.reuse_count_30d": 5 });
    expect(result.score).toBe(587); // 500 - 100 + 187
    expect(result.contributions[0]?.code).toBe("DEVICE_SHARED"); // |187| > |100|
  });
});
