import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLog, AuditAppendResult, AuditLogEntry } from "../../../domain/ports/audit-log.js";

/**
 * append_audit_log() is the ONLY writer of the hash chain (see migration
 * 0002) — this adapter calls the RPC and, only on failure, falls back to
 * the pending_audit outbox. The record is never dropped; the failure is
 * always visible (loud log + a "buffered"/"lost" outcome the caller turns
 * into a SignalUsage entry) rather than a silent gap (FOUNDATION §6.3).
 */
export class SupabaseAuditLog implements AuditLog {
  constructor(private readonly client: SupabaseClient) {}

  async append(decisionId: string, redactedPayload: Record<string, unknown>): Promise<AuditAppendResult> {
    const auditId = randomUUID();

    const { error: rpcError } = await this.client.rpc("append_audit_log", {
      p_id: auditId,
      p_decision_id: decisionId,
      p_payload: redactedPayload,
    });
    if (!rpcError) return { auditId, outcome: "recorded" };

    console.error("audit_chain RPC failed; buffering to pending_audit", { decisionId, auditId, error: rpcError.message });

    const { error: bufferError } = await this.client.from("pending_audit").insert({
      id: auditId,
      decision_id: decisionId,
      payload: redactedPayload,
      last_error: rpcError.message,
    });
    if (bufferError) {
      console.error("CRITICAL: audit backstop write also failed — record not buffered", {
        decisionId,
        auditId,
        error: bufferError.message,
      });
      return { auditId, outcome: "lost" };
    }

    return { auditId, outcome: "buffered" };
  }

  async findByDecisionId(decisionId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from("audit_log")
      .select("id, seq, payload, prev_hash, hash, created_at")
      .eq("decision_id", decisionId)
      .order("seq", { ascending: true });
    if (error) throw new Error(`failed to load audit trail for decision ${decisionId}: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      seq: row.seq,
      payload: row.payload,
      prevHash: row.prev_hash,
      hash: row.hash,
      createdAt: row.created_at,
    }));
  }
}
