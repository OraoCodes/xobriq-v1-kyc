import { describe, it, expect } from "vitest";
import { PelezaProvider } from "../src/infrastructure/providers/peleza/peleza-provider.js";

/**
 * LIVE INTEGRATION TEST — makes one real call to Peleza's sandbox
 * credit-info endpoint. Confirmed against a live sandbox call: field names
 * match the documented shape exactly (identity_number, credit_score,
 * delinquency_code, has_fraud, is_guarantor, enquiries/credit_applications
 * {last_3_months, last_6_months, last_12_months}, account_summary
 * {total_accounts, active_accounts, closed_accounts,
 * total_outstanding_balance, total_overdue_balance}, account_info[]
 * {account_number, account_status, days_in_arrears,
 * highest_days_in_arrears, delinquency_code, overdue_balance,
 * product_type_id}). No corrections needed this time.
 *
 * The DOCUMENTED sample id (1028845317, also used by the Kenya-ID live
 * test) does NOT exist in the credit-info sandbox — confirmed: it 404s with
 * "Credit information not found in our database". The default below
 * (35531967) is the id Peleza's own docs example response actually
 * returns data for — found by trying it directly, since the docs' request
 * example uses 1028845317 but the response body's own `identity_number` is
 * 35531967, a strong hint the docs sample request doesn't match live data.
 *
 * Skipped by default. To run it:
 *
 *   PELEZA_LIVE_TEST=1 \
 *   PELEZA_CLIENT_ID=... \
 *   PELEZA_CLIENT_SECRET=... \
 *   PELEZA_LIVE_TEST_ID=35531967 \
 *   pnpm --filter @xobriq/api test peleza-credit-info.live
 */
describe.skipIf(process.env.PELEZA_LIVE_TEST !== "1")("PelezaProvider.getCredit — live sandbox call", () => {
  it("returns a genuine success ProviderResult whose shape matches the documented envelope", async () => {
    const provider = new PelezaProvider();
    const identityNumber = process.env.PELEZA_LIVE_TEST_ID ?? "35531967";

    const result = await provider.getCredit(identityNumber);

    expect(result.status).toBe("success");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.data).not.toBeNull();
    expect(typeof result.data?.open_applications).toBe("number");
    expect(typeof result.data?.overdue_ratio).toBe("number");
    expect(Number.isNaN(result.data?.overdue_ratio)).toBe(false);
    expect(typeof result.data?.worst_days_in_arrears).toBe("number");
    expect(["found", "thin_file", "not_found"]).toContain(result.data?.report_status);
  }, 15_000);
});
