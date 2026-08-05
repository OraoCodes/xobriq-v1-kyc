import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionAction } from "@xobriq/shared";
import type {
  DecisionRepository,
  DecisionRecord,
  IdempotencyRecord,
  ListDecisionsOptions,
  ListDecisionsResult,
  DecisionStats,
} from "../../../domain/ports/decision-repository.js";

interface DecisionRow {
  id: string;
  customer_id: string;
  entity_id: string | null;
  event_type: string;
  reference_id: string | null;
  initiated_by: DecisionRecord["initiatedBy"];
  initiated_by_user: string | null;
  recommended_action: DecisionRecord["recommendedAction"];
  risk_score: number;
  risk_band: DecisionRecord["riskBand"];
  confidence_score: number;
  risk_reasons: DecisionRecord["riskReasons"];
  explanation: DecisionRecord["explanation"];
  signals_used: DecisionRecord["signalsUsed"];
  model_version: string;
  latency_ms: number | null;
  created_at: string;
}

function toRow(record: DecisionRecord): DecisionRow {
  return {
    id: record.id,
    customer_id: record.customerId,
    entity_id: record.entityId,
    event_type: record.eventType,
    reference_id: record.referenceId,
    initiated_by: record.initiatedBy,
    initiated_by_user: record.initiatedByUser,
    recommended_action: record.recommendedAction,
    risk_score: record.riskScore,
    risk_band: record.riskBand,
    confidence_score: record.confidenceScore,
    risk_reasons: record.riskReasons,
    explanation: record.explanation,
    signals_used: record.signalsUsed,
    model_version: record.modelVersion,
    latency_ms: record.latencyMs,
    created_at: record.createdAt,
  };
}

function fromRow(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    entityId: row.entity_id,
    eventType: row.event_type,
    referenceId: row.reference_id,
    initiatedBy: row.initiated_by,
    initiatedByUser: row.initiated_by_user,
    recommendedAction: row.recommended_action,
    riskScore: row.risk_score,
    riskBand: row.risk_band,
    confidenceScore: row.confidence_score,
    riskReasons: row.risk_reasons,
    explanation: row.explanation,
    signalsUsed: row.signals_used,
    modelVersion: row.model_version,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

export class SupabaseDecisionRepository implements DecisionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async save(record: DecisionRecord): Promise<void> {
    const { error } = await this.client.from("decisions").insert(toRow(record));
    if (error) throw new Error(`failed to save decision ${record.id}: ${error.message}`);
  }

  async findById(id: string, customerId: string): Promise<DecisionRecord | null> {
    // Scoped by customer_id in the query itself: a decision belonging to
    // another tenant comes back as no rows, indistinguishable from an id
    // that never existed — never a distinguishable "forbidden" response.
    const { data, error } = await this.client
      .from("decisions")
      .select("*")
      .eq("id", id)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`failed to load decision ${id}: ${error.message}`);
    return data ? fromRow(data as DecisionRow) : null;
  }

  async listByCustomer(customerId: string, options: ListDecisionsOptions): Promise<ListDecisionsResult> {
    let query = this.client
      .from("decisions")
      .select("*", { count: "exact" })
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);
    if (options.initiatedBy) query = query.eq("initiated_by", options.initiatedBy);

    const { data, error, count } = await query;
    if (error) throw new Error(`failed to list decisions for customer ${customerId}: ${error.message}`);
    return { items: (data ?? []).map((row) => fromRow(row as DecisionRow)), total: count ?? 0 };
  }

  async statsForCustomer(customerId: string): Promise<DecisionStats> {
    const { data, error } = await this.client.from("decisions").select("recommended_action").eq("customer_id", customerId);
    if (error) throw new Error(`failed to compute stats for customer ${customerId}: ${error.message}`);
    const byAction: Record<DecisionAction, number> = { ALLOW: 0, BLOCK: 0, REVIEW: 0, STEP_UP: 0 };
    for (const row of data ?? []) byAction[row.recommended_action as DecisionAction]++;
    return { total: (data ?? []).length, byAction };
  }

  async findIdempotencyRecord(customerId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const { data, error } = await this.client
      .from("idempotency_keys")
      .select("request_hash, response_status, response_body")
      .eq("customer_id", customerId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(`failed to load idempotency key: ${error.message}`);
    if (!data) return null;
    return { requestHash: data.request_hash, responseStatus: data.response_status, responseBody: data.response_body };
  }

  async reserveIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    const { error } = await this.client.from("idempotency_keys").insert({
      customer_id: customerId,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      response_status: responseStatus,
      response_body: responseBody,
    });
    if (error) throw new Error(`failed to reserve idempotency key: ${error.message}`);
  }
}
