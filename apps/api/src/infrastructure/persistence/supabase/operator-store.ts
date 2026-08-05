import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperatorStore, OperatorRecord, NewOperator } from "../../../domain/ports/operator-store.js";

interface OperatorRow {
  id: string;
  customer_id: string;
  email: string;
  password_hash: string;
  role: OperatorRecord["role"];
  is_active: boolean;
}

function fromRow(row: OperatorRow): OperatorRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
  };
}

export class SupabaseOperatorStore implements OperatorStore {
  constructor(private readonly client: SupabaseClient) {}

  async findByEmail(email: string): Promise<OperatorRecord | null> {
    const { data, error } = await this.client
      .from("operators")
      .select("id, customer_id, email, password_hash, role, is_active")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(`failed to look up operator: ${error.message}`);
    return data ? fromRow(data as OperatorRow) : null;
  }

  async createOperator(operator: NewOperator): Promise<void> {
    const { error } = await this.client.from("operators").insert({
      id: operator.id,
      customer_id: operator.customerId,
      email: operator.email.toLowerCase(),
      password_hash: operator.passwordHash,
      role: operator.role,
    });
    if (error) throw new Error(`failed to create operator ${operator.email}: ${error.message}`);
  }
}
