import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { ApiKeyStore, ApiKeyMode } from "../../domain/ports/api-key-store.js";
import { FULL_SCOPES } from "../../domain/ports/api-key-store.js";
import type { SessionStore } from "../../domain/ports/session-store.js";
import type { OperatorRole } from "../../domain/ports/operator-store.js";
import { hashApiKey, parseKeyMode } from "../../infrastructure/security/api-key.js";
import { hashSessionToken, isSessionToken } from "../../infrastructure/security/session-token.js";
import { AppError } from "../../shared/errors.js";

export interface AuthContext {
  subjectId: string;
  via: "api_key" | "session";
  mode: ApiKeyMode;
  customerId: string;
  scopes: readonly string[];
  role?: OperatorRole;
  email?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/**
 * Tenant is ALWAYS derived here, from the bearer credential — never from the
 * request body. Two credential kinds resolve to the same shape:
 *   - `sk_test_`/`sk_live_` — api_keys, for third-party/developer integration.
 *   - `sess_...`            — account_sessions, for the logged-in portal.
 * A session always resolves to "test" mode — the portal is the demo path and
 * always runs against MockProvider, never the real Peleza integration, even
 * though the live provider is now fully wired for sk_live_ API-key callers.
 * A session also carries the operator's role, which admin-only routes check
 * separately.
 * Every failure path is an indistinguishable 401 — no hints for probing.
 */
export async function authenticate(
  authorizationHeader: string | undefined,
  keyStore: ApiKeyStore,
  sessionStore: SessionStore,
): Promise<AuthContext> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AppError("UNAUTHENTICATED", "Missing or malformed Authorization header");
  }
  const rawToken = authorizationHeader.slice("Bearer ".length).trim();

  if (isSessionToken(rawToken)) {
    const session = await sessionStore.findByTokenHash(hashSessionToken(rawToken));
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      throw new AppError("UNAUTHENTICATED", "Invalid or expired session");
    }
    return {
      subjectId: session.id,
      via: "session",
      mode: "test",
      customerId: session.customerId,
      scopes: FULL_SCOPES,
      role: session.role,
      email: session.userEmail,
    };
  }

  const mode = parseKeyMode(rawToken);
  if (!mode) throw new AppError("UNAUTHENTICATED", "Malformed bearer credential");

  const record = await keyStore.findByHash(hashApiKey(rawToken));
  if (!record || !record.isActive || record.mode !== mode) {
    throw new AppError("UNAUTHENTICATED", "Invalid or inactive API key");
  }

  return { subjectId: record.id, via: "api_key", mode: record.mode, customerId: record.customerId, scopes: record.scopes };
}

export function requireScope(auth: AuthContext, scope: string): void {
  if (!auth.scopes.includes(scope)) throw new AppError("FORBIDDEN", `Missing required scope: ${scope}`);
}

/** Admin-only actions (key rotation) require a logged-in session with the admin role — never an API key. */
export function requireAdminSession(auth: AuthContext): void {
  if (auth.via !== "session" || auth.role !== "admin") {
    throw new AppError("FORBIDDEN", "Requires an admin session");
  }
}

/** Attach as a route's preHandler; sets request.auth for the handler to read. */
export function authPreHandler(keyStore: ApiKeyStore, sessionStore: SessionStore): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    request.auth = await authenticate(request.headers.authorization, keyStore, sessionStore);
  };
}
