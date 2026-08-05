import { createHash, randomBytes } from "node:crypto";

export type ApiKeyMode = "test" | "live";

/** api_keys.key_hash is a plain SHA-256 of the raw key — the key itself has enough entropy, no pepper needed. */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** `sk_test_...` / `sk_live_...` — null for anything else (malformed key). */
export function parseKeyMode(rawKey: string): ApiKeyMode | null {
  if (rawKey.startsWith("sk_test_")) return "test";
  if (rawKey.startsWith("sk_live_")) return "live";
  return null;
}

/** A fresh raw key for provisioning/rotation — shown to the caller exactly once. */
export function generateApiKey(mode: ApiKeyMode): string {
  return `sk_${mode}_${randomBytes(24).toString("hex")}`;
}

/** The display-safe prefix stored alongside the hash — e.g. "sk_test_2e18612f". */
export function keyPrefixOf(rawKey: string): string {
  return rawKey.slice(0, 16);
}
