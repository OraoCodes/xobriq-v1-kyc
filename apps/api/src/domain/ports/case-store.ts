export type CaseStatus = "open" | "resolved";

export interface CaseRecord {
  id: string;
  customerId: string;
  decisionId: string;
  entityId: string;
  status: CaseStatus;
  riskScore: number;
  resolution: string | null;
  reasonCode: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CaseStore {
  createForReview(decisionId: string, entityId: string, riskScore: number, customerId: string): Promise<string>;
  findCaseById(id: string, customerId: string): Promise<CaseRecord | null>;
  /** Newest first. */
  listCasesByCustomer(customerId: string, status?: CaseStatus): Promise<CaseRecord[]>;
  /**
   * Callers check existence/status via findById first (404 vs 409 need to
   * be distinguishable) — this assumes the case is open and just updates it.
   */
  resolve(id: string, customerId: string, resolution: string, reasonCode: string, resolvedBy: string): Promise<CaseRecord>;
}
