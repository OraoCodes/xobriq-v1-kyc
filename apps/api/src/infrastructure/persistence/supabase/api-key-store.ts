import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiKeyStore, ApiKeyRecord, NewApiKey } from "../../../domain/ports/api-key-store.js";

interface ApiKeyRow {
  id: string;
  mode: ApiKeyRecord["mode"];
  customer_id: string;
  scopes: string[] | null;
  is_active: boolean;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

function fromRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    mode: row.mode,
    customerId: row.customer_id,
    scopes: row.scopes ?? [],
    isActive: row.is_active,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

const SELECT_COLUMNS = "id, mode, customer_id, scopes, is_active, key_prefix, created_at, last_used_at";

export class SupabaseApiKeyStore implements ApiKeyStore {
  constructor(private readonly client: SupabaseClient) {}

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const { data, error } = await this.client.from("api_keys").select(SELECT_COLUMNS).eq("key_hash", keyHash).maybeSingle();
    if (error) throw new Error(`failed to look up api key: ${error.message}`);
    return data ? fromRow(data as ApiKeyRow) : null;
  }

  async listKeysByCustomer(customerId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await this.client
      .from("api_keys")
      .select(SELECT_COLUMNS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`failed to list api keys for customer ${customerId}: ${error.message}`);
    return (data ?? []).map((row) => fromRow(row as ApiKeyRow));
  }

  async createKey(key: NewApiKey): Promise<void> {
    const { error } = await this.client.from("api_keys").insert({
      id: key.id,
      customer_id: key.customerId,
      customer_name: key.customerName ?? null,
      mode: key.mode,
      key_hash: key.keyHash,
      key_prefix: key.keyPrefix,
      scopes: key.scopes,
      is_active: true,
    });
    if (error) throw new Error(`failed to create api key ${key.id}: ${error.message}`);
  }

  async deactivate(id: string, customerId: string): Promise<void> {
    const { error } = await this.client.from("api_keys").update({ is_active: false }).eq("id", id).eq("customer_id", customerId);
    if (error) throw new Error(`failed to deactivate api key ${id}: ${error.message}`);
  }
}
