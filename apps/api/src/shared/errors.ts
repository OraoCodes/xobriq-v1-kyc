/**
 * Typed application errors with stable codes. The HTTP edge maps these codes
 * to status codes in one place; the domain throws them with meaning, never a
 * bare Error, and never leaks internals to the caller.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "CASE_NOT_OPEN"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(source: string) {
    super("PROVIDER_TIMEOUT", `Provider ${source} timed out`, { source });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", `${resource}${id ? ` ${id}` : ""} not found`, { resource, id });
  }
}
