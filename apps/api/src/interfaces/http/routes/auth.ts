import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../shared/errors.js";
import { parseOrThrow } from "../validate.js";
import { LoginSchema } from "../schemas.js";
import { verifyPassword } from "../../../infrastructure/security/password.js";
import { generateSessionToken, hashSessionToken } from "../../../infrastructure/security/session-token.js";
import type { AppDeps } from "../app.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post("/v1/auth/login", async (request, reply) => {
    const body = parseOrThrow(LoginSchema, request.body);

    // Same status, same message, whether the email doesn't exist or the
    // password is wrong — never a signal an attacker can use to enumerate emails.
    const incorrect = () => new AppError("UNAUTHENTICATED", "Email or password is incorrect.");

    const operator = await deps.operators.findByEmail(body.email);
    if (!operator || !operator.isActive) throw incorrect();

    const validPassword = await verifyPassword(body.password, operator.passwordHash);
    if (!validPassword) throw incorrect();

    const rawToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await deps.sessions.createSession({
      id: randomUUID(),
      customerId: operator.customerId,
      userEmail: operator.email,
      tokenHash: hashSessionToken(rawToken),
      expiresAt,
    });

    const customer = await deps.customers.findCustomerById(operator.customerId);

    reply.send({
      token: rawToken,
      expires_at: expiresAt,
      customer_id: operator.customerId,
      customer_name: customer?.name ?? null,
      email: operator.email,
      role: operator.role,
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const auth = request.auth!;
    if (auth.via === "session") await deps.sessions.deleteById(auth.subjectId);
    reply.send({ ok: true });
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const auth = request.auth!;
    const customer = await deps.customers.findCustomerById(auth.customerId);
    reply.send({
      customer_id: auth.customerId,
      customer_name: customer?.name ?? null,
      email: auth.email ?? null,
      role: auth.role ?? null,
      via: auth.via,
    });
  });
}
