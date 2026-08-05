/**
 * A Result type. Provider calls and other fallible operations return this
 * instead of throwing, so the decision cascade can DEGRADE (lower confidence,
 * record the failure) rather than crash. A timed-out credit bureau must never
 * take down a loan decision — it just makes us less sure.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
