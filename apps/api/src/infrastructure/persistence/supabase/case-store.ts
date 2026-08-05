import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseStore, CaseRecord, CaseStatus } from "../../../domain/ports/case-store.js";

interface CaseRow {
  id: string;
  customer_id: string;
  decision_id: string;
  entity_id: string;
  status: CaseStatus;
  risk_score: number;
  resolution: string | null;
  reason_code: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

function fromRow(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    decisionId: row.decision_id,
    entityId: row.entity_id,
    status: row.status,
    riskScore: row.risk_score,
    resolution: row.resolution,
    reasonCode: row.reason_code,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export class SupabaseCaseStore implements CaseStore {
  constructor(private readonly client: SupabaseClient) {}

  async createForReview(decisionId: string, entityId: string, riskScore: number, customerId: string): Promise<string> {
    const id = randomUUID();
    const { error } = await this.client.from("cases").insert({
      id,
      customer_id: customerId,
      decision_id: decisionId,
      entity_id: entityId,
      status: "open",
      risk_score: riskScore,
    });
    if (error) throw new Error(`failed to create case for decision ${decisionId}: ${error.message}`);
    return id;
  }

  async findCaseById(id: string, customerId: string): Promise<CaseRecord | null> {
    const { data, error } = await this.client.from("cases").select("*").eq("id", id).eq("customer_id", customerId).maybeSingle();
    if (error) throw new Error(`failed to load case ${id}: ${error.message}`);
    return data ? fromRow(data as CaseRow) : null;
  }

  async listCasesByCustomer(customerId: string, status?: CaseStatus): Promise<CaseRecord[]> {
    let query = this.client.from("cases").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(`failed to list cases for customer ${customerId}: ${error.message}`);
    return (data ?? []).map((row) => fromRow(row as CaseRow));
  }

  async resolve(id: string, customerId: string, resolution: string, reasonCode: string, resolvedBy: string): Promise<CaseRecord> {
    const { data, error } = await this.client
      .from("cases")
      .update({ status: "resolved", resolution, reason_code: reasonCode, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("customer_id", customerId)
      .select("*")
      .single();
    if (error) throw new Error(`failed to resolve case ${id}: ${error.message}`);
    return fromRow(data as CaseRow);
  }
}
