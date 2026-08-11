import { createHash } from "node:crypto";
import type { DecisionRequest, DecisionResponse } from "@xobriq/shared";
import type { IdentityProvider } from "../domain/ports/identity-provider.js";
import type { DecisionRepository } from "../domain/ports/decision-repository.js";
import type { AuditLog } from "../domain/ports/audit-log.js";
import type { CaseStore } from "../domain/ports/case-store.js";
import type { EntityGraph } from "../domain/ports/entity-graph.js";
import { SignalGatherer } from "./signal-gatherer.js";
import { runCascade, type CascadeOutcome } from "./cascade-runner.js";
import { DecisionSink } from "./decision-sink.js";
import { getEngineConfig } from "../infrastructure/config/engine-config.js";
import { AppError } from "../shared/errors.js";

export interface DecideDeps {
  provider: IdentityProvider;
  graph: EntityGraph;
  decisions: DecisionRepository;
  audit: AuditLog;
  cases: CaseStore;
}

export interface DecideContext {
  customerId: string;
  idempotencyKey?: string;
}

function hashRequest(request: DecisionRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

/**
 * The thin loop: prepare (Tier 0 + Tier 1 + hard rules) → cascade (Tier
 * 2a/2b via the pure planner, see cascade-runner.ts) → finalize
 * (persist/audit/case, see decision-sink.ts). A hard rule short-circuits
 * straight to finalize.
 */
export async function decide(request: DecisionRequest, context: DecideContext, deps: DecideDeps): Promise<DecisionResponse> {
  const startedAt = Date.now();
  const requestHash = hashRequest(request);

  if (context.idempotencyKey) {
    const existing = await deps.decisions.findIdempotencyRecord(context.customerId, context.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different request body");
      }
      return existing.responseBody as DecisionResponse;
    }
  }

  const config = getEngineConfig();
  const gatherer = new SignalGatherer(deps.provider, deps.graph);
  const prepared = await gatherer.prepare(request);

  const outcome: CascadeOutcome = prepared.hardRule
    ? {
        action: prepared.hardRule.action,
        riskReasons: prepared.hardRule.reasons,
        score: 1000,
        confidence: 100,
        signalsUsed: prepared.signalsUsed,
      }
    : await runCascade(gatherer, request, prepared, config);

  const sink = new DecisionSink(deps.decisions, deps.audit, deps.cases, deps.graph);
  const response = await sink.finalize({
    request,
    customerId: context.customerId,
    personEntityId: prepared.personEntityId,
    personEntityIsNew: prepared.personEntityIsNew,
    deviceEntityId: prepared.deviceEntityId,
    bankEntityId: prepared.bankEntityId,
    action: outcome.action,
    score: outcome.score,
    confidence: outcome.confidence,
    riskReasons: outcome.riskReasons,
    modelVersion: config.weights.version,
    signalsUsed: outcome.signalsUsed,
    latencyMs: Date.now() - startedAt,
    applicantFullName: prepared.identity.full_name,
    ...(outcome.creditDetail ? { creditDetail: outcome.creditDetail } : {}),
  });

  if (context.idempotencyKey) {
    await deps.decisions.reserveIdempotencyKey(context.customerId, context.idempotencyKey, requestHash, 200, response);
  }

  return response;
}
