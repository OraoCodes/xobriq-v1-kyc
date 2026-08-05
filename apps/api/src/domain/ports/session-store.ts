import type { OperatorRole } from "./operator-store.js";

export interface NewSession {
  id: string;
  customerId: string;
  userEmail: string;
  tokenHash: string;
  expiresAt: string;
}

export interface SessionRecord {
  id: string;
  customerId: string;
  userEmail: string;
  role: OperatorRole;
  expiresAt: string;
}

/**
 * account_sessions — human/portal auth, distinct from api_keys
 * (programmatic/integration auth). `findByTokenHash` resolves the role via
 * the operator the session belongs to, so auth doesn't need a third store.
 */
export interface SessionStore {
  createSession(session: NewSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteById(id: string): Promise<void>;
}
