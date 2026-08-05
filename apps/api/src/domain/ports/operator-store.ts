export type OperatorRole = "admin" | "operator";

export interface OperatorRecord {
  id: string;
  customerId: string;
  email: string;
  passwordHash: string;
  role: OperatorRole;
  isActive: boolean;
}

export interface NewOperator {
  id: string;
  customerId: string;
  email: string;
  passwordHash: string;
  role: OperatorRole;
}

/**
 * One operator identity per email, scoped to one customer. Populated only by
 * hand onboarding (scripts/provision-org.ts) — there is no public signup.
 */
export interface OperatorStore {
  findByEmail(email: string): Promise<OperatorRecord | null>;
  createOperator(operator: NewOperator): Promise<void>;
}
