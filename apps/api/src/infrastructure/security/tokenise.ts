import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256(pepper, rawValue) — the ONLY way raw PII may become an entity
 * key_hash. Pure and pepper-explicit (not env-reading) so it stays testable;
 * callers own sourcing the pepper (ENTITY_HASH_PEPPER in production —
 * rotating it orphans every existing hash by design, FOUNDATION §7).
 */
export function tokenise(rawValue: string, pepper: string): string {
  return createHmac("sha256", pepper).update(rawValue).digest("hex");
}
