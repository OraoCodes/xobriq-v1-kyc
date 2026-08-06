import { describe, it, expect } from "vitest";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";

/**
 * LIVE INTEGRATION TEST — makes one real call to Peleza's sandbox.
 *
 * Skipped by default. To run it:
 *
 *   PELEZA_LIVE_TEST=1 \
 *   PELEZA_CLIENT_ID=... \
 *   PELEZA_CLIENT_SECRET=... \
 *   PELEZA_LIVE_TEST_ID=1028845317 \
 *   pnpm --filter @xobriq/api test peleza-kenya-id.live
 *
 * PELEZA_LIVE_TEST_ID defaults to the sample id_number shown in Peleza's own
 * Kenya-ID docs; override it if a different sandbox test ID is documented.
 * This only asserts the response's STRUCTURE (keys/types), not specific
 * field values, since sandbox data for a given test ID may not match this
 * repo's synthetic fixtures.
 */
describe.skipIf(process.env.PELEZA_LIVE_TEST !== "1")("PelezaProvider.getIdentity — live sandbox call", () => {
  it("returns a ProviderResult whose success shape matches the documented envelope", async () => {
    const provider = new PelezaProvider();
    const testId = process.env.PELEZA_LIVE_TEST_ID ?? "1028845317";

    const result = await provider.getIdentity(testId);

    expect(["success", "not_found"]).toContain(result.status);
    expect(typeof result.latencyMs).toBe("number");

    if (result.status === "success") {
      expect(result.data).not.toBeNull();
      expect(typeof result.data?.id_valid).toBe("boolean");
      expect(typeof result.data?.full_name).toBe("string");
      expect(typeof result.data?.dob).toBe("string");
      expect(["M", "F", null]).toContain(result.data?.gender);
    }
  }, 15_000);
});
