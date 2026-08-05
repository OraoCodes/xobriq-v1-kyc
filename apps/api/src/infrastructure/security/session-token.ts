import { createHash, randomBytes } from "node:crypto";

const SESSION_PREFIX = "sess_";

/** A fresh, high-entropy raw session token — sent to the client once, never stored raw. */
export function generateSessionToken(): string {
  return `${SESSION_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function isSessionToken(rawToken: string): boolean {
  return rawToken.startsWith(SESSION_PREFIX);
}

/** account_sessions.token_hash is a plain SHA-256 of the raw token — same reasoning as api_keys.key_hash: high entropy, no pepper needed. */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
