import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ApiKeyStore } from "../../domain/ports/api-key-store.js";
import type { DecisionRepository } from "../../domain/ports/decision-repository.js";
import type { AuditLog } from "../../domain/ports/audit-log.js";
import type { EntityGraph } from "../../domain/ports/entity-graph.js";
import type { CaseStore } from "../../domain/ports/case-store.js";
import type { FeedbackStore } from "../../domain/ports/feedback-store.js";
import type { OperatorStore } from "../../domain/ports/operator-store.js";
import type { SessionStore } from "../../domain/ports/session-store.js";
import type { CustomerStore } from "../../domain/ports/customer-store.js";
import type { IdentityProvider } from "../../domain/ports/identity-provider.js";
import { authenticate } from "./auth.js";
import { errorHandler } from "./error-handler.js";
import { AppError } from "../../shared/errors.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerCaseRoutes } from "./routes/cases.js";
import { registerStatsRoute } from "./routes/stats.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerKeyRoutes } from "./routes/keys.js";

export interface AppDeps {
  keyStore: ApiKeyStore;
  operators: OperatorStore;
  sessions: SessionStore;
  customers: CustomerStore;
  decisions: DecisionRepository;
  audit: AuditLog;
  graph: EntityGraph;
  cases: CaseStore;
  feedback: FeedbackStore;
  /** The composition root's mode → provider map — sk_test_ keys (and all sessions) get MockProvider, sk_live_ keys get PelezaProvider. */
  providers: { test: IdentityProvider; live: IdentityProvider };
}

const API_VERSION = "2026-01-01";
const VERSION_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Routes reachable without a bearer credential — you need one of these to get one. */
const PUBLIC_ROUTES = new Set(["/health", "/v1/auth/login"]);

/** A configured, injectable Fastify instance — no `.listen()` here, so it's testable via `.inject()`. */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 100_000 });

  // Only relevant if a browser ever calls this API cross-origin directly —
  // the portal itself never does (it proxies server-to-server, see
  // apps/portal/lib/xobriq-server.ts's `server-only` guard), so this mainly
  // matters for third-party developer integrations. CORS_ORIGINS is a
  // comma-separated allowlist; unset means "no restriction" (@fastify/cors's
  // own default), preserving current behaviour for anyone who hasn't set it.
  const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.register(cors, { origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true });

  // Runs before rate-limit's own hook (registered below) so per-subject limiting
  // can read request.auth; also the single place that validates/echoes the
  // version header. PUBLIC_ROUTES are the only unauthenticated routes.
  app.addHook("onRequest", async (request, reply) => {
    const version = request.headers["x-xobriq-version"];
    if (typeof version === "string" && !VERSION_FORMAT.test(version)) {
      throw new AppError("VALIDATION_ERROR", "X-Xobriq-Version must be formatted YYYY-MM-DD");
    }
    reply.header("X-Xobriq-Version", typeof version === "string" ? version : API_VERSION);

    if (PUBLIC_ROUTES.has(request.url.split("?")[0]!)) return;
    request.auth = await authenticate(request.headers.authorization, deps.keyStore, deps.sessions);
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.auth?.subjectId ?? request.ip,
    errorResponseBuilder: () => ({ error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } }),
  });

  app.setErrorHandler(errorHandler);

  registerHealthRoute(app);
  registerAuthRoutes(app, deps);
  registerKeyRoutes(app, deps);
  registerDecisionRoutes(app, deps);
  registerCaseRoutes(app, deps);
  registerStatsRoute(app, deps);

  return app;
}
