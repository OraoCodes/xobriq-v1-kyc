import type { FastifyInstance } from "fastify";
import type { CaseRecord } from "../../../domain/ports/case-store.js";
import { AppError } from "../../../shared/errors.js";
import { requireScope } from "../auth.js";
import { parseOrThrow } from "../validate.js";
import { ResolveCaseSchema, ListCasesQuerySchema } from "../schemas.js";
import type { AppDeps } from "../app.js";

function toCaseView(record: CaseRecord) {
  return {
    id: record.id,
    decision_id: record.decisionId,
    entity_id: record.entityId,
    status: record.status,
    risk_score: record.riskScore,
    resolution: record.resolution,
    reason_code: record.reasonCode,
    resolved_by: record.resolvedBy,
    created_at: record.createdAt,
    resolved_at: record.resolvedAt,
  };
}

export function registerCaseRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get("/v1/cases", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "cases:read");
    const query = parseOrThrow(ListCasesQuerySchema, request.query);
    const items = await deps.cases.listCasesByCustomer(auth.customerId, query.status);
    reply.send({ items: items.map(toCaseView) });
  });

  app.get("/v1/cases/:id", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "cases:read");
    const { id } = request.params as { id: string };
    const record = await deps.cases.findCaseById(id, auth.customerId);
    if (!record) throw new AppError("NOT_FOUND", "case not found");
    reply.send(toCaseView(record));
  });

  app.post("/v1/cases/:id/resolve", async (request, reply) => {
    const auth = request.auth!;
    requireScope(auth, "cases:write");
    const { id } = request.params as { id: string };
    const body = parseOrThrow(ResolveCaseSchema, request.body);

    const existing = await deps.cases.findCaseById(id, auth.customerId);
    if (!existing) throw new AppError("NOT_FOUND", "case not found");
    if (existing.status !== "open") throw new AppError("CASE_NOT_OPEN", "case is already resolved");

    const resolvedBy = body.resolved_by ?? auth.email ?? auth.subjectId;
    const updated = await deps.cases.resolve(id, auth.customerId, body.resolution, body.reason_code, resolvedBy);
    reply.send(toCaseView(updated));
  });
}
