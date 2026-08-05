/**
 * `recorded`  — the hash-chain RPC succeeded; the chain advanced.
 * `buffered`  — the RPC failed but the pending_audit outbox write
 *               succeeded; the record is safe and will be drained later.
 * `lost`      — both the RPC and the outbox write failed. Must never happen
 *               silently: the adapter logs loudly when this occurs. Still
 *               returned, never thrown — the decision itself must still
 *               reach the caller (FOUNDATION §6.3).
 */
export type AuditOutcome = "recorded" | "buffered" | "lost";

export interface AuditAppendResult {
  auditId: string;
  outcome: AuditOutcome;
}

export interface AuditLogEntry {
  id: string;
  seq: number;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
}

/**
 * The backstop lives inside the adapter, not the port: `append` either
 * succeeds against the real chain or falls back to the pending_audit outbox
 * — callers only ever see the outcome, never an exception. A decision that
 * was acted on but never audited is a compliance gap, not a crash.
 */
export interface AuditLog {
  append(decisionId: string, redactedPayload: Record<string, unknown>): Promise<AuditAppendResult>;
  /** The chain rows for one decision, in sequence order — the audit trail. */
  findByDecisionId(decisionId: string): Promise<AuditLogEntry[]>;
}
