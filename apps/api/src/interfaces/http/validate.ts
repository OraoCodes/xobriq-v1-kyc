import type { ZodType } from "zod";
import { AppError } from "../../shared/errors.js";

/**
 * Parses with Zod; a failure becomes a 422 VALIDATION_ERROR with field-level
 * detail. `Def`/`Input` are pinned to `any` deliberately: constraining only
 * on `ZodType<T>` lets TS infer T from a schema's Input side too (e.g. a
 * `.default()` field's pre-default `T | undefined`), which corrupts the
 * inferred Output type for callers.
 */
export function parseOrThrow<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}
