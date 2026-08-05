import type { DecisionAction, RiskBand, InitiatedBy, RiskReason, SignalUsage, DecisionExplanation } from "@xobriq/shared";

/**
 * Shapes returned by the xobriq HTTP layer that aren't part of the
 * @xobriq/shared contract (list/detail views built into the route handlers,
 * not the decision contract itself). DecisionResponse from @xobriq/shared
 * covers POST /v1/decisions; these cover the read-side routes.
 */

export interface DecisionListItem {
  id: string;
  created_at: string;
  event_type: string;
  reference_id: string | null;
  initiated_by: InitiatedBy;
  recommended_action: DecisionAction;
  risk_score: number;
  risk_band: RiskBand;
  confidence_score: number;
}

export interface DecisionListResponse {
  items: DecisionListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditTrailEntry {
  seq: number;
  hash: string;
  prev_hash: string;
  created_at: string;
}

export interface DecisionDetail {
  id: string;
  object: "decision";
  created_at: string;
  event_type: string;
  reference_id: string | null;
  initiated_by: InitiatedBy;
  recommended_action: DecisionAction;
  risk_score: number;
  risk_band: RiskBand;
  confidence_score: number;
  risk_reasons: RiskReason[];
  explanation: DecisionExplanation;
  signals_used: SignalUsage[];
  model_version: string;
  latency_ms: number | null;
  entity: { id: string; lifetime_decisions: number } | null;
  audit_trail: AuditTrailEntry[];
}

export type CaseStatus = "open" | "resolved";

export interface CaseView {
  id: string;
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

export interface StatsResponse {
  total: number;
  by_action: Record<DecisionAction, number>;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export type OperatorRole = "admin" | "operator";

export interface MeResponse {
  customer_id: string;
  customer_name: string | null;
  email: string | null;
  role: OperatorRole | null;
  via: "api_key" | "session";
}

export interface LoginResponse {
  customer_id: string;
  customer_name: string | null;
  email: string;
  role: OperatorRole;
}

export type ApiKeyMode = "test" | "live";

export interface ApiKeyView {
  id: string;
  mode: ApiKeyMode;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface RotateKeyResponse {
  id: string;
  mode: ApiKeyMode;
  key_prefix: string;
  secret: string;
}
