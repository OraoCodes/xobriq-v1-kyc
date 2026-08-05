import type {
  DecisionAction,
  RiskBand,
  RiskReason,
  DecisionExplanation,
  SignalUsage,
  InitiatedBy,
} from "@xobriq/shared";

/**
 * The persisted shape of a decision — the `decisions` table (see
 * apps/api/migrations/0001_core_schema.sql). Distinct from DecisionResponse:
 * this is what's stored; DecisionSink builds the wire response from it plus
 * a couple of fields (audit_id, entity.is_new) that only exist post-persist.
 */
export interface DecisionRecord {
  id: string;
  customerId: string;
  entityId: string | null;
  eventType: string;
  referenceId: string | null;
  initiatedBy: InitiatedBy;
  initiatedByUser: string | null;
  recommendedAction: DecisionAction;
  riskScore: number;
  riskBand: RiskBand;
  confidenceScore: number;
  riskReasons: RiskReason[];
  explanation: DecisionExplanation;
  signalsUsed: SignalUsage[];
  modelVersion: string;
  latencyMs: number | null;
  createdAt: string;
}

export interface IdempotencyRecord {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}

export interface ListDecisionsOptions {
  initiatedBy?: InitiatedBy;
  limit: number;
  offset: number;
}

export interface ListDecisionsResult {
  items: DecisionRecord[];
  total: number;
}

export interface DecisionStats {
  total: number;
  byAction: Record<DecisionAction, number>;
}

/**
 * Tenant-scoped by construction: every read takes a customerId and returns
 * nothing (not an error) for a decision that belongs to someone else — a
 * cross-tenant lookup must be indistinguishable from one that never existed.
 */
export interface DecisionRepository {
  save(record: DecisionRecord): Promise<void>;
  findById(id: string, customerId: string): Promise<DecisionRecord | null>;
  /** Newest first. */
  listByCustomer(customerId: string, options: ListDecisionsOptions): Promise<ListDecisionsResult>;
  statsForCustomer(customerId: string): Promise<DecisionStats>;
  findIdempotencyRecord(customerId: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;
  reserveIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void>;
}
