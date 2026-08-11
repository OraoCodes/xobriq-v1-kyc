import type { FastifyInstance } from "fastify";
import type { DecisionRequest, DisbursementAccount, FeedbackRequest } from "@xobriq/shared";
import { decide } from "../../../application/decide.js";
import { AppError } from "../../../shared/errors.js";
import { requireScope } from "../auth.js";
import { parseOrThrow } from "../validate.js";
import { DecisionRequestSchema, FeedbackRequestSchema, ListDecisionsQuerySchema } from "../schemas.js";
import type { AppDeps } from "../app.js";

type ParsedDecisionRequest = ReturnType<typeof DecisionRequestSchema.parse>;

// Zod's `.optional()` infers as `T | undefined`, which exactOptionalPropertyTypes
// rejects for a target `field?: T` (present must mean exactly T). Each of these
// rebuilds its object field-by-field, omitting a key entirely rather than ever
// assigning it `undefined`.

function buildSubject(subject: ParsedDecisionRequest["subject"]): DecisionRequest["subject"] {
  const result: DecisionRequest["subject"] = { national_id: subject.national_id };
  if (subject.phone !== undefined) result.phone = subject.phone;
  return result;
}

function buildDisbursementAccount(account: NonNullable<NonNullable<ParsedDecisionRequest["event_data"]>["disbursement_account"]>): DisbursementAccount {
  const result: DisbursementAccount = {};
  if (account.account_name !== undefined) result.account_name = account.account_name;
  if (account.account_number !== undefined) result.account_number = account.account_number;
  if (account.bank_id !== undefined) result.bank_id = account.bank_id;
  return result;
}

function buildEventData(eventData: NonNullable<ParsedDecisionRequest["event_data"]>): NonNullable<DecisionRequest["event_data"]> {
  const result: NonNullable<DecisionRequest["event_data"]> = {};
  if (eventData.amount !== undefined) result.amount = eventData.amount;
  if (eventData.currency !== undefined) result.currency = eventData.currency;
  if (eventData.kra_pin !== undefined) result.kra_pin = eventData.kra_pin;
  if (eventData.disbursement_account !== undefined) result.disbursement_account = buildDisbursementAccount(eventData.disbursement_account);
  return result;
}

function buildDevice(device: NonNullable<ParsedDecisionRequest["device"]>): NonNullable<DecisionRequest["device"]> {
  const result: NonNullable<DecisionRequest["device"]> = {};
  if (device.fingerprint !== undefined) result.fingerprint = device.fingerprint;
  if (device.session_token !== undefined) result.session_token = device.session_token;
  return result;
}

/**
 * Builds the DecisionRequest the engine actually runs — deliberately NOT a
 * spread of the raw body. `initiated_by` is computed server-side from the
 * auth context (always authenticated by the time a route handler runs) and
 * an explicit `X-Xobriq-Manual` header; the client's own claim in the body
 * is never trusted. Every other field passes through field-by-field so a
 * future body field can't sneak in unreviewed.
 */
function buildDecisionRequest(body: ParsedDecisionRequest, manualFlag: boolean): DecisionRequest {
  const request: DecisionRequest = {
    event_type: body.event_type,
    subject: buildSubject(body.subject),
    initiated_by: manualFlag ? "manual" : "api",
  };
  if (body.reference_id !== undefined) request.reference_id = body.reference_id;
  if (body.event_data !== undefined) request.event_data = buildEventData(body.event_data);
  if (manualFlag && body.initiated_by_user !== undefined) request.initiated_by_user = body.initiated_by_user;
  if (body.device !== undefined) request.device = buildDevice(body.device);
  return request;
}

function buildFeedbackRequest(body: ReturnType<typeof FeedbackRequestSchema.parse>): FeedbackRequest {
  const feedback: FeedbackRequest = { outcome: body.outcome };
  if (body.fraud_type !== undefined) feedback.fraud_type = body.fraud_type;
  if (body.loss_amount !== undefined) feedback.loss_amount = body.loss_amount;
  return feedback;
}

export function registerDecisionRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post("/v1/decisions", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:write");

    const body = parseOrThrow(DecisionRequestSchema, request.body);
    const manualFlag = request.headers["x-xobriq-manual"] === "true";
    const decisionRequest = buildDecisionRequest(body, manualFlag);

    const idempotencyKeyHeader = request.headers["idempotency-key"];
    const idempotencyKey = typeof idempotencyKeyHeader === "string" ? idempotencyKeyHeader : undefined;

    // A session is always issued mock-provider access by default (the portal
    // is the free, self-contained demo path — see auth.ts). This header is
    // the one narrow, explicit way an operator can opt a SPECIFIC
    // portal-initiated check into the real, cost-incurring Peleza
    // integration. API-key callers are unaffected — their mode always comes
    // from the key itself (sk_test_/sk_live_), never from this header.
    const liveCheckRequested = request.headers["x-xobriq-live-check"] === "true";
    const effectiveMode = auth.via === "session" && liveCheckRequested ? "live" : auth.mode;
    const provider = deps.providers[effectiveMode];

    const response = await decide(
      decisionRequest,
      { customerId: auth.customerId, ...(idempotencyKey ? { idempotencyKey } : {}) },
      { provider, graph: deps.graph, decisions: deps.decisions, audit: deps.audit, cases: deps.cases },
    );
    reply.code(200).send({ ...response, mode: effectiveMode });
  });

  app.get("/v1/decisions/:id", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:read");
    const { id } = request.params as { id: string };

    const record = await deps.decisions.findById(id, auth.customerId);
    if (!record) throw new AppError("NOT_FOUND", "decision not found");

    const auditTrail = await deps.audit.findByDecisionId(id);
    const lifetimeDecisions = record.entityId ? await deps.graph.countDecisionsForEntity(record.entityId) : 0;

    reply.send({
      id: record.id,
      object: "decision",
      created_at: record.createdAt,
      event_type: record.eventType,
      reference_id: record.referenceId,
      initiated_by: record.initiatedBy,
      recommended_action: record.recommendedAction,
      risk_score: record.riskScore,
      risk_band: record.riskBand,
      confidence_score: record.confidenceScore,
      risk_reasons: record.riskReasons,
      explanation: record.explanation,
      signals_used: record.signalsUsed,
      model_version: record.modelVersion,
      latency_ms: record.latencyMs,
      entity: record.entityId ? { id: record.entityId, lifetime_decisions: lifetimeDecisions } : null,
      audit_trail: auditTrail.map((e) => ({ seq: e.seq, hash: e.hash, prev_hash: e.prevHash, created_at: e.createdAt })),
    });
  });

  app.get("/v1/decisions", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:read");
    const query = parseOrThrow(ListDecisionsQuerySchema, request.query);

    const result = await deps.decisions.listByCustomer(auth.customerId, {
      limit: query.limit,
      offset: query.offset,
      ...(query.initiated_by ? { initiatedBy: query.initiated_by } : {}),
    });

    reply.send({
      items: result.items.map((r) => ({
        id: r.id,
        created_at: r.createdAt,
        event_type: r.eventType,
        reference_id: r.referenceId,
        initiated_by: r.initiatedBy,
        recommended_action: r.recommendedAction,
        risk_score: r.riskScore,
        risk_band: r.riskBand,
        confidence_score: r.confidenceScore,
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.post("/v1/decisions/:id/feedback", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "decisions:write");
    const { id } = request.params as { id: string };

    const record = await deps.decisions.findById(id, auth.customerId);
    if (!record) throw new AppError("NOT_FOUND", "decision not found");

    const body = parseOrThrow(FeedbackRequestSchema, request.body);
    // reported_by_customer_id comes from the key, never the body — the body
    // schema doesn't even carry a customer field.
    const feedbackId = await deps.feedback.create(id, auth.customerId, buildFeedbackRequest(body));
    reply.code(201).send({ id: feedbackId });
  });
}
