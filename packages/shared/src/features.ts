/**
 * The typed feature registry.
 *
 * WHY THIS EXISTS: in the previous build, features were a `Record<string,
 * unknown>` keyed by string literals like "device.reuse_count_30d", shared
 * across the feature extractor, the scorer, and the weights config. A typo
 * in any one place failed *silently* — the scorer condition simply never
 * matched, so a weight never applied, so a fraud signal was quietly missed
 * with no error. In a fraud system that is the worst class of bug.
 *
 * Here every feature key is a member of a single union. A typo is now a
 * compile error, and the weights config is validated against this registry
 * at load time (see infrastructure/config). Adding a feature is a deliberate
 * edit here, which is exactly the friction we want.
 */

export const FEATURE_KEYS = [
  // Tier 0 — device / velocity / graph (our own signal, free)
  "device.reuse_count_30d",
  "device.is_emulator",
  "device.is_rooted",
  "ip.is_proxy_vpn_datacentre",
  "velocity.applications_1h",
  "velocity.applications_24h",
  "velocity.applications_7d",
  "graph.entity_flagged",
  "graph.shared_bank_account_count",

  // Tier 1 — applicant identity (from IPRS)
  "applicant.id_valid",
  "applicant.age",
  "applicant.dob",
  "identity.full_name",

  // Tier 2 — cross-checks & credit (paid, only when confidence is low)
  "xcheck.bank_name_match",
  "xcheck.kra_name_match",
  "xcheck.dl_dob_match",
  "xcheck.phone_match",
  "credit.inquiries_7d",
  "credit.distinct_recent_inquirers",
  "credit.open_applications",
  "credit.overdue_ratio",
  "credit.worst_days_in_arrears",
  "credit.report_status",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** A feature vector is a partial, typed map — not every feature is present on every request. */
export type Features = Partial<Record<FeatureKey, unknown>>;

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

/** Runtime guard used by config loading to reject a weights file referencing an unknown feature. */
export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEY_SET.has(value);
}
