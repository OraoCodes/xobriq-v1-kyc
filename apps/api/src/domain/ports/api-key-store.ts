export type ApiKeyMode = "test" | "live";

/** Every provisioned key and every logged-in session gets the full set — there's no finer-grained scope model yet. */
export const FULL_SCOPES = ["decisions:write", "decisions:read", "cases:read", "cases:write"] as const;

export interface ApiKeyRecord {
  id: string;
  mode: ApiKeyMode;
  customerId: string;
  scopes: readonly string[];
  isActive: boolean;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface NewApiKey {
  id: string;
  customerId: string;
  customerName?: string;
  mode: ApiKeyMode;
  keyHash: string;
  keyPrefix: string;
  scopes: readonly string[];
}

/**
 * Resolves a hashed bearer key to its tenant + scopes. Tenant is ALWAYS
 * derived from the key via this port — never from a request body, which
 * can't be trusted to name its own customer.
 */
export interface ApiKeyStore {
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listKeysByCustomer(customerId: string): Promise<ApiKeyRecord[]>;
  createKey(key: NewApiKey): Promise<void>;
  /** Rotation's other half: the old key stops resolving immediately. */
  deactivate(id: string, customerId: string): Promise<void>;
}
