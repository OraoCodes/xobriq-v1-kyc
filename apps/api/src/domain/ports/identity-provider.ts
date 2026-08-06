/**
 * THE PROVIDER PORT.
 *
 * The core asks for normalised, vendor-neutral identity/credit signals and
 * never learns which vendor answered. This is the seam that lets a future
 * vendor slot in as a new adapter, wired at one composition-root site, with
 * zero change to domain code — guard it: no vendor name, no vendor-specific
 * field name, and no vendor error code may ever leak past this interface.
 *
 * Every lookup is fallible by design: a provider failure DEGRADES a decision
 * (lower confidence, a recorded signal failure) — it never throws into the
 * core. See ProviderResult.
 */

export type ProviderStatus = "success" | "not_found" | "timeout" | "error";

export interface ProviderResult<T> {
  status: ProviderStatus;
  data: T | null;
  latencyMs: number;
  error?: string;
}

/**
 * The applicant's identity, in the shape the domain reasons about.
 *
 * `id_valid` / `full_name` / `dob` / `gender` come from the base IPRS lookup
 * (`getIdentity`) and are always present once that call succeeds.
 * `phone_on_record` rides along with it when the registry holds one.
 *
 * `bank_account_name` / `kra_taxpayer_name` / `dl_dob` are each returned by
 * their own cross-check lookup (`getBankAccountName` / `getKraTaxpayerName`
 * / `getDrivingLicence`) as a narrow fragment — see the `Pick<...>` return
 * types below. This full interface is the shape those fragments merge into
 * once gathered, which is what makes them comparable: a bank-name
 * cross-check and a KRA-name cross-check are only a "mismatch" or a "match"
 * because both express themselves in the same normalised field.
 */
export interface IdentitySignal {
  id_valid: boolean;
  full_name: string | null;
  dob: string | null; // ISO 8601 date, e.g. "1990-05-14"
  gender: string | null;
  bank_account_name?: string | null;
  kra_taxpayer_name?: string | null;
  dl_dob?: string | null;
  phone_on_record?: string | null;
  /** Non-null means the registry records this identity as deceased — a categorical hard-rule signal, not a scored one. */
  date_of_death?: string | null;
  /** Captured for future use — no rule reads these yet. */
  pin?: string | null;
  has_photo?: boolean;
  has_fingerprint?: boolean;
  has_signature?: boolean;
}

export interface CreditSignal {
  /** MockProvider's own synthetic 7-day window. Peleza's credit-info does NOT expose a 7-day bucket (only 3/6/12-month) — its adapter leaves this unset rather than fabricate one. See inquiries_3m. */
  inquiries_7d?: number;
  /** MockProvider-only — Peleza's credit-info exposes no distinct-lender breakdown. */
  distinct_recent_inquirers?: number;
  open_applications: number;
  overdue_ratio: number; // 0..1 — overdue balance / total balance
  worst_days_in_arrears: number;
  report_status: "found" | "thin_file" | "not_found";
  /** Peleza credit-info's honest granularity — credit enquiries pulled in the last 3 months. */
  inquiries_3m?: number;
  /** Peleza credit-info's honest granularity — loan applications submitted in the last 3 months (the loan-stacking signal). */
  applications_3m?: number;
  /** The bureau's own fraud flag, when the vendor exposes one. */
  has_fraud?: boolean;
}

/**
 * The lookups the cascade needs. Tier 0 (device/velocity/graph) is served by
 * the persistence layer, not a provider — it isn't part of this port.
 *
 *   Tier 1  — getIdentity           (base IPRS lookup)
 *   Tier 2a — getCredit, getBankAccountName, getKraTaxpayerName
 *   Tier 2b — getDrivingLicence     (fetched only if 2a leaves confidence
 *                                     below the bar)
 */
export interface IdentityProvider {
  getIdentity(nationalId: string): Promise<ProviderResult<IdentitySignal>>;
  getCredit(nationalId: string): Promise<ProviderResult<CreditSignal>>;
  /** bankId (Peleza's bank id — see banks.ts) is required for a real lookup; omit it to skip cleanly rather than guess. */
  getBankAccountName(
    accountNumber: string,
    bankId?: number,
  ): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>>;
  getKraTaxpayerName(kraPin: string): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>>;
  getDrivingLicence(nationalId: string): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>>;
}
