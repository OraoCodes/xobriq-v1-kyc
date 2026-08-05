import type { Features, RiskReason, RiskDirection, Severity } from "@xobriq/shared";
import { isFeatureKey } from "@xobriq/shared";

/**
 * The scorer — a transparent, additive weighted-evidence model.
 *
 * Each rule maps a feature condition to a signed points contribution and a
 * reason. Points sum onto a base score and squash to 0–1000. Because a reason
 * IS a weighted contribution, the explanation can never disagree with the
 * score — explainability is free and always faithful. Weights load from
 * config so a risk analyst can retune without a deploy.
 *
 * Kept deliberately simple and interface-driven: a trained model (LightGBM)
 * can replace `WeightedEvidenceScorer` later with zero caller changes.
 *
 * Confidence is NOT computed here — it depends on which cascade tiers ran and
 * whether their lookups succeeded, which the scorer can't see. See
 * confidence.ts, computed by the cascade.
 */

export interface WeightRuleCondition {
  feature: string;
  equals?: unknown;
  gte?: number;
  lte?: number;
}

export interface WeightRule {
  code: string;
  category: string;
  weight: number;
  severity: Severity;
  when: WeightRuleCondition;
  evidence: string[];
}

export interface WeightsConfig {
  version: string;
  base_score: number;
  rules: WeightRule[];
}

export interface ScoreResult {
  score: number;
  contributions: RiskReason[];
  modelVersion: string;
}

export interface Scorer {
  evaluate(features: Features): ScoreResult;
}

function directionFor(weight: number): RiskDirection {
  return weight >= 0 ? "increases_risk" : "decreases_risk";
}

function squash(raw: number): number {
  return Math.min(1000, Math.max(0, Math.round(raw)));
}

function conditionMet(condition: WeightRuleCondition, features: Features): boolean {
  const value = features[condition.feature as keyof Features];
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.gte !== undefined) return typeof value === "number" && value >= condition.gte;
  if (condition.lte !== undefined) return typeof value === "number" && value <= condition.lte;
  return false;
}

/**
 * Validate a weights config against the typed feature registry at load time.
 * A rule referencing a feature key that doesn't exist is a configuration bug
 * that would otherwise fail SILENTLY (condition never matches → weight never
 * applies → fraud signal missed). We refuse to load such a config. This is
 * the runtime half of the fix for the stringly-typed feature bag.
 */
export function validateWeightsConfig(config: WeightsConfig): void {
  const unknown: string[] = [];
  for (const rule of config.rules) {
    if (!isFeatureKey(rule.when.feature)) unknown.push(`${rule.code}: when.feature "${rule.when.feature}"`);
    for (const ev of rule.evidence) {
      if (!isFeatureKey(ev)) unknown.push(`${rule.code}: evidence "${ev}"`);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `weights config references unknown feature keys:\n  ${unknown.join("\n  ")}\n` +
        `Add the key to FEATURE_KEYS in @xobriq/shared or fix the typo.`,
    );
  }
}

export class WeightedEvidenceScorer implements Scorer {
  constructor(private readonly config: WeightsConfig) {
    validateWeightsConfig(config);
  }

  evaluate(features: Features): ScoreResult {
    const contributions: RiskReason[] = [];
    let raw = this.config.base_score;

    for (const rule of this.config.rules) {
      if (!conditionMet(rule.when, features)) continue;
      raw += rule.weight;

      const evidence: Record<string, unknown> = {};
      for (const key of rule.evidence) evidence[key] = features[key as keyof Features];

      contributions.push({
        code: rule.code,
        category: rule.category,
        weight: rule.weight,
        direction: directionFor(rule.weight),
        severity: rule.severity,
        evidence,
      });
    }

    contributions.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    return { score: squash(raw), contributions, modelVersion: this.config.version };
  }
}
