import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerStore, CustomerRecord } from "../../../domain/ports/customer-store.js";

export class SupabaseCustomerStore implements CustomerStore {
  constructor(private readonly client: SupabaseClient) {}

  async findCustomerById(id: string): Promise<CustomerRecord | null> {
    const { data, error } = await this.client.from("customers").select("id, name").eq("id", id).maybeSingle();
    if (error) throw new Error(`failed to look up customer ${id}: ${error.message}`);
    return data ? { id: data.id, name: data.name } : null;
  }
}
