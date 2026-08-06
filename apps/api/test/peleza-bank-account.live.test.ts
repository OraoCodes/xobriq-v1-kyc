import { describe, it, expect } from "vitest";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";

/**
 * LIVE INTEGRATION TEST — makes one real call to Peleza's sandbox bank-
 * account endpoint. Confirmed against a live sandbox call: unlike Kenya-ID
 * (whose documented field names were wrong — `data.name` vs the real
 * `data.full_name`, etc.), the documented bank-account shape turned out to
 * be correct — `data.bank.{id,name}`, `data.account_holder.name`,
 * `data.status`, `data.is_verified` all match types.ts's
 * PelezaBankAccountData exactly.
 *
 * The documented sample account_number (1002845631) does NOT exist in the
 * sandbox (confirmed: returns a genuine 404 "Bank Account Not Found") — the
 * default below (1234567890 / bank_id 34, "Equity Bank") is a real working
 * sandbox pair, found by probing.
 *
 * Skipped by default. To run it:
 *
 *   PELEZA_LIVE_TEST=1 \
 *   PELEZA_CLIENT_ID=... \
 *   PELEZA_CLIENT_SECRET=... \
 *   PELEZA_LIVE_TEST_ACCOUNT_NUMBER=1234567890 \
 *   PELEZA_LIVE_TEST_BANK_ID=34 \
 *   pnpm --filter @xobriq/api test peleza-bank-account.live
 */
describe.skipIf(process.env.PELEZA_LIVE_TEST !== "1")("PelezaProvider.getBankAccountName — live sandbox call", () => {
  it("returns a genuine success ProviderResult whose shape matches the documented envelope", async () => {
    const provider = new PelezaProvider();
    const accountNumber = process.env.PELEZA_LIVE_TEST_ACCOUNT_NUMBER ?? "1234567890";
    const bankId = Number(process.env.PELEZA_LIVE_TEST_BANK_ID ?? "34");

    const result = await provider.getBankAccountName(accountNumber, bankId);

    expect(result.status).toBe("success");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.data).not.toBeNull();
    expect(typeof result.data?.bank_account_name).toBe("string");
  }, 15_000);
});
