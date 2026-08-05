import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError, type ErrorCode } from "../../shared/errors.js";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  CASE_NOT_OPEN: 409,
  PROVIDER_TIMEOUT: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** One mapping, one shape. Never leaks internals or a stack trace to the caller. */
export function errorHandler(error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.code(STATUS_BY_CODE[error.code]).send({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }

  // request.log is a no-op (logger: false) — console.error so unhandled errors are never silently swallowed.
  console.error(`unhandled error on ${request.method} ${request.url}:`, error);

  // A genuine client error from Fastify itself (e.g. malformed JSON) — surface
  // it as VALIDATION_ERROR rather than masking a 4xx as a false INTERNAL 500.
  if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
    reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });
    return;
  }

  reply.code(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
}
