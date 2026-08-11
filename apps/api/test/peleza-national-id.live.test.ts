import { describe, it, expect } from "vitest";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";

/**
 * LIVE INTEGRATION TEST — one real call to Peleza's PRODUCTION identity
 * endpoint, through the actual PelezaProvider class (not a raw curl), to
 * confirm the environment-routing logic (types.ts/parser.ts/
 * peleza-provider.ts) actually works end to end, not just in isolation.
 *
 * Discovered 2026-08-11: `/api/v1/id/ke` — verified working in sandbox — was
 * 500ing in production (confirmed via 5 direct calls, 2 different national
 * IDs, generic unhandled-exception HTML error page, not Peleza's normal
 * JSON error format). `/api/v1/national-id` was found to work reliably in
 * production instead, with a different (simpler) response shape — no
 * date_of_death/pin/biometric fields. PelezaProvider now routes by base
 * URL: sandbox uses `/id/ke`, anything else uses `/national-id`.
 *
 * Skipped by default. Requires PRODUCTION credentials (not the sandbox
 * pair used by the other live tests) and PELEZA_BASE_URL explicitly set to
 * production — this test does NOT default it, unlike the sandbox live
 * tests, since accidentally running production calls silently would be
 * worse than failing loudly on a missing env var.
 *
 *   PELEZA_LIVE_TEST=1 \
 *   PELEZA_BASE_URL=https://verify.peleza.com \
 *   PELEZA_CLIENT_ID=<production client id> \
 *   PELEZA_CLIENT_SECRET=<production secret> \
 *   PELEZA_LIVE_TEST_ID=<a real national ID> \
 *   pnpm --filter @xobriq/api test peleza-national-id.live
 */
describe.skipIf(process.env.PELEZA_LIVE_TEST !== "1")("PelezaProvider.getIdentity — live PRODUCTION sandbox call", () => {
  it("routes to /api/v1/national-id in production and returns a genuine success", async () => {
    if (process.env.PELEZA_BASE_URL !== "https://verify.peleza.com") {
      throw new Error(
        "This test only runs against production — set PELEZA_BASE_URL=https://verify.peleza.com explicitly (not defaulted, to avoid accidentally skipping the intended target).",
      );
    }
    const identityNumber = process.env.PELEZA_LIVE_TEST_ID;
    if (!identityNumber) throw new Error("Set PELEZA_LIVE_TEST_ID to a real national ID to test against production.");

    const provider = new PelezaProvider();
    const result = await provider.getIdentity(identityNumber);

    expect(result.status).toBe("success");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.data).not.toBeNull();
    expect(typeof result.data?.id_valid).toBe("boolean");
    expect(typeof result.data?.full_name).toBe("string");
    expect(typeof result.data?.dob).toBe("string");
    expect(["M", "F", null]).toContain(result.data?.gender);
    // Confirms this really came from national-id, not id/ke.
    expect(result.data?.date_of_death).toBeUndefined();
    expect(result.data?.has_photo).toBeUndefined();
  }, 15_000);
});
