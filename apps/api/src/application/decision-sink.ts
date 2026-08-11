import { randomUUID } from "node:crypto";
import type { DecisionRequest, DecisionResponse, RiskReason, SignalUsage, DecisionAction } from "@xobriq/shared";
import { riskBandFor } from "@xobriq/shared";
import type { DecisionRepository, DecisionRecord } from "../domain/ports/decision-repository.js";
import type { AuditLog, AuditAppendResult } from "../domain/ports/audit-log.js";
import type { CaseStore } from "../domain/ports/case-store.js";
import type { EntityGraph } from "../domain/ports/entity-graph.js";
import type { IdentitySignal } from "../domain/ports/identity-provider.js";
import type { CreditDetail } from "./signal-gatherer.js";

export interface FinalizeInput {
  request: DecisionRequest;
  customerId: string;
  personEntityId: string;
  personEntityIsNew: boolean;
  deviceEntityId: string | null;
  bankEntityId: string | null;
  action: DecisionAction;
  score: number;
  confidence: number;
  riskReasons: RiskReason[];
  modelVersion: string;
  signalsUsed: SignalUsage[];
  latencyMs: number;
  /** Analyst-detail only — attached to the HTTP response, never persisted to the audit-safe DecisionRecord. Always available (falls back to the empty/unresolved sentinel). */
  identity: IdentitySignal;
  creditDetail?: CreditDetail;
}

function buildApplicantDetail(identity: IdentitySignal): NonNullable<DecisionResponse["applicant"]> {
  return {
    id_valid: identity.id_valid,
    full_name: identity.full_name,
    dob: identity.dob,
    gender: identity.gender,
    ...(identity.phone_on_record !== undefined ? { phone_on_record: identity.phone_on_record } : {}),
    ...(identity.date_of_death !== undefined ? { date_of_death: identity.date_of_death } : {}),
    ...(identity.pin !== undefined ? { pin: identity.pin } : {}),
    ...(identity.has_photo !== undefined ? { has_photo: identity.has_photo } : {}),
    ...(identity.has_fingerprint !== undefined ? { has_fingerprint: identity.has_fingerprint } : {}),
    ...(identity.has_signature !== undefined ? { has_signature: identity.has_signature } : {}),
  };
}

function auditSignalUsage(result: AuditAppendResult): SignalUsage {
  if (result.outcome === "recorded") {
    return { source: "audit_chain", status: "success", latency_ms: null, cost_tier: 0 };
  }
  return {
    source: "audit_chain",
    status: "error",
    latency_ms: null,
    cost_tier: 0,
    reason:
      result.outcome === "buffered"
        ? "audit RPC failed; buffered to the pending_audit outbox"
        : "audit RPC failed and the outbox write also failed",
  };
}

function buildExplanation(action: DecisionAction, riskReasons: RiskReason[], modelVersion: string): DecisionResponse["explanation"] {
  const primary = riskReasons[0] ?? null;
  const categories: Record<string, number> = {};
  for (const reason of riskReasons) categories[reason.category] = (categories[reason.category] ?? 0) + reason.weight;
  const human = primary
    ? `${action} — primary driver: ${primary.code} (${primary.category}).`
    : `${action} — no risk reasons contributed.`;
  return { human, machine: { primary_driver: primary?.code ?? null, risk_categories: categories, model_version: modelVersion } };
}

/**
 * Owns persist + audit + case-creation AFTER the decision is computed — the
 * only place a decision touches storage. Entity links for THIS request are
 * created here, deliberately after SignalGatherer's Tier-0 counts already
 * ran, so a request never counts itself as its own prior history.
 */
export class DecisionSink {
  constructor(
    private readonly decisions: DecisionRepository,
    private readonly audit: AuditLog,
    private readonly cases: CaseStore,
    private readonly graph: EntityGraph,
  ) {}

  async finalize(input: FinalizeInput): Promise<DecisionResponse> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const riskBand = riskBandFor(input.score);

    // Redacted: only the decision's own outcome, never raw PII (no
    // national_id, name, phone, or account number).
    const redactedPayload = {
      event_type: input.request.event_type,
      recommended_action: input.action,
      risk_score: input.score,
      risk_band: riskBand,
      confidence_score: input.confidence,
      risk_reasons: input.riskReasons,
    };
    const auditResult = await this.audit.append(id, redactedPayload);
    const signalsUsed: SignalUsage[] = [...input.signalsUsed, auditSignalUsage(auditResult)];

    if (input.deviceEntityId) await this.graph.linkEntities(input.personEntityId, input.deviceEntityId, "used_device");
    if (input.bankEntityId) await this.graph.linkEntities(input.personEntityId, input.bankEntityId, "disbursed_to");

    const explanation = buildExplanation(input.action, input.riskReasons, input.modelVersion);

    const record: DecisionRecord = {
      id,
      customerId: input.customerId,
      entityId: input.personEntityId,
      eventType: input.request.event_type,
      referenceId: input.request.reference_id ?? null,
      initiatedBy: input.request.initiated_by,
      initiatedByUser: input.request.initiated_by_user ?? null,
      recommendedAction: input.action,
      riskScore: input.score,
      riskBand,
      confidenceScore: input.confidence,
      riskReasons: input.riskReasons,
      explanation,
      signalsUsed,
      modelVersion: input.modelVersion,
      latencyMs: input.latencyMs,
      createdAt,
    };
    await this.decisions.save(record);

    if (input.action === "REVIEW") {
      await this.cases.createForReview(id, input.personEntityId, input.score, input.customerId);
    }

    const lifetimeDecisions = await this.graph.countDecisionsForEntity(input.personEntityId);

    return {
      id,
      object: "decision",
      created_at: createdAt,
      event_type: input.request.event_type,
      reference_id: input.request.reference_id ?? null,
      initiated_by: input.request.initiated_by,
      // Analyst-detail fields — HTTP response only, deliberately excluded from
      // `record`/`redactedPayload` above (never persisted, never audited).
      applicant: buildApplicantDetail(input.identity),
      ...(input.creditDetail
        ? {
            credit_detail: {
              score: input.creditDetail.score,
              delinquency_code: input.creditDetail.delinquencyCode,
              is_guarantor: input.creditDetail.isGuarantor,
            },
          }
        : {}),
      recommended_action: input.action,
      risk_score: input.score,
      risk_band: riskBand,
      confidence_score: input.confidence,
      risk_reasons: input.riskReasons,
      explanation,
      step_up_options: input.action === "STEP_UP" ? [{ method: "additional_document", expected_confidence_gain: 20 }] : [],
      signals_used: signalsUsed,
      entity: { id: input.personEntityId, is_new: input.personEntityIsNew, lifetime_decisions: lifetimeDecisions },
      audit_id: auditResult.auditId,
      latency_ms: input.latencyMs,
    };
  }
}
