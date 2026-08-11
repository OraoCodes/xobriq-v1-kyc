import type { DecisionRequest, Features, SignalUsage } from "@xobriq/shared";
import { isValidBankId } from "@xobriq/shared";
import type { SignalOutcome } from "../domain/services/confidence.js";
import type { HardRuleVerdict } from "../domain/services/rules.js";
import { applyHardRules } from "../domain/services/rules.js";
import type { CascadeTier } from "../domain/services/cascade-planner.js";
import type { IdentityProvider, IdentitySignal, ProviderResult } from "../domain/ports/identity-provider.js";
import type { EntityGraph } from "../domain/ports/entity-graph.js";
import { computeAge, identityFeatures, creditFeatures, namesMatch, datesMatch } from "./feature-mapping.js";

export interface PreparedContext {
  personEntityId: string;
  personEntityIsNew: boolean;
  deviceEntityId: string | null;
  bankEntityId: string | null;
  identity: IdentitySignal;
  features: Partial<Features>;
  outcomes: SignalOutcome[];
  signalsUsed: SignalUsage[];
  hardRule: HardRuleVerdict | null;
}

export interface CreditDetail {
  score: string | null;
  delinquencyCode: string | null;
  isGuarantor: boolean | null;
}

export interface TierGatherResult {
  outcomes: SignalOutcome[];
  features: Partial<Features>;
  signalsUsed: SignalUsage[];
  /** Analyst-detail only, captured alongside the scored credit features — see CreditSignal's capture-only fields. */
  creditDetail?: CreditDetail;
}

function signalUsageFrom(source: string, result: ProviderResult<unknown>, costTier: 0 | 1 | 2): SignalUsage {
  const usage: SignalUsage = { source, status: result.status, latency_ms: result.latencyMs, cost_tier: costTier };
  if (result.error) usage.reason = result.error;
  return usage;
}

const EMPTY_IDENTITY: IdentitySignal = { id_valid: false, full_name: null, dob: null, gender: null };

/**
 * Owns provider + graph I/O during a decision — the only thing that touches
 * the outside world mid-decision. `prepare` runs Tier 0 (device/graph, via
 * EntityGraph — always first, free) then Tier 1 (base identity, via
 * IdentityProvider). `gatherTier` runs Tier 2a/2b inside the cascade loop.
 */
export class SignalGatherer {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly graph: EntityGraph,
  ) {}

  async prepare(request: DecisionRequest): Promise<PreparedContext> {
    const tier0 = await this.gatherTierZero(request);
    const tier1 = await this.gatherIdentity(request.subject.national_id);

    return {
      personEntityId: tier0.personEntityId,
      personEntityIsNew: tier0.personEntityIsNew,
      deviceEntityId: tier0.deviceEntityId,
      bankEntityId: tier0.bankEntityId,
      identity: tier1.identity ?? EMPTY_IDENTITY,
      features: { ...tier0.features, ...tier1.features },
      outcomes: tier0.outcomes,
      signalsUsed: [...tier0.signalsUsed, ...tier1.signalsUsed],
      hardRule: tier1.hardRule,
    };
  }

  async gatherTier(tier: CascadeTier, request: DecisionRequest, identity: IdentitySignal): Promise<TierGatherResult> {
    return tier === "2a" ? this.gatherTier2a(request, identity) : this.gatherTier2b(request, identity);
  }

  private async gatherTierZero(request: DecisionRequest): Promise<{
    personEntityId: string;
    personEntityIsNew: boolean;
    deviceEntityId: string | null;
    bankEntityId: string | null;
    features: Partial<Features>;
    outcomes: SignalOutcome[];
    signalsUsed: SignalUsage[];
  }> {
    const person = await this.graph.getOrCreateEntity("person", request.subject.national_id);

    let deviceEntityId: string | null = null;
    let reuseCount: number | null = null;
    const fingerprint = request.device?.fingerprint;
    if (fingerprint) {
      const device = await this.graph.getOrCreateEntity("device", fingerprint);
      deviceEntityId = device.id;
      // Count BEFORE this request's own link exists — DecisionSink links after.
      reuseCount = await this.graph.linkedEntityCount(device.id, "used_device", person.id, 30);
    }

    let bankEntityId: string | null = null;
    const accountNumber = request.event_data?.disbursement_account?.account_number;
    if (accountNumber) {
      const bank = await this.graph.getOrCreateEntity("bank_account", accountNumber);
      bankEntityId = bank.id;
    }

    const relevantEntityIds = [person.id, deviceEntityId, bankEntityId].filter((id): id is string => id !== null);
    const flagged = await this.graph.isAnyEntityFlagged(relevantEntityIds);

    const features: Partial<Features> = { "graph.entity_flagged": flagged };
    if (reuseCount !== null) features["device.reuse_count_30d"] = reuseCount;

    // A clean Tier-0 result is baseline-neutral (an empty history is itself
    // a definitive answer, per confidence.ts) — only a genuine flag is
    // pushed as an outcome, earning the heavy graph success bonus.
    const outcomes: SignalOutcome[] = flagged ? [{ key: "graph", status: "success" }] : [];

    return {
      personEntityId: person.id,
      personEntityIsNew: person.isNew,
      deviceEntityId,
      bankEntityId,
      features,
      outcomes,
      signalsUsed: [{ source: "entity_graph", status: "success", latency_ms: null, cost_tier: 0 }],
    };
  }

  private async gatherIdentity(nationalId: string): Promise<{
    identity: IdentitySignal | null;
    features: Partial<Features>;
    signalsUsed: SignalUsage[];
    hardRule: HardRuleVerdict | null;
  }> {
    const result = await this.provider.getIdentity(nationalId);
    const signalsUsed = [signalUsageFrom("iprs_identity", result, 1)];

    if (result.status !== "success" || !result.data) {
      // No identity resolved at all — fail closed for the hard rule.
      const hardRule = applyHardRules({ identityValid: false, applicantAge: null });
      return { identity: null, features: { "applicant.id_valid": false }, signalsUsed, hardRule };
    }

    const identity = result.data;
    const hardRule = applyHardRules({
      identityValid: identity.id_valid,
      applicantAge: computeAge(identity.dob),
      dateOfDeath: identity.date_of_death ?? null,
    });
    return { identity, features: identityFeatures(identity), signalsUsed, hardRule };
  }

  private async gatherTier2a(request: DecisionRequest, identity: IdentitySignal): Promise<TierGatherResult> {
    const nationalId = request.subject.national_id;
    const outcomes: SignalOutcome[] = [];
    const signalsUsed: SignalUsage[] = [];
    let features: Partial<Features> = {};

    const credit = await this.provider.getCredit(nationalId);
    outcomes.push({ key: "credit", status: credit.status });
    signalsUsed.push(signalUsageFrom("credit_bureau", credit, 2));
    let creditDetail: CreditDetail | undefined;
    if (credit.status === "success" && credit.data) {
      features = { ...features, ...creditFeatures(credit.data) };
      const { credit_score, delinquency_code, is_guarantor } = credit.data;
      // Only attach when the vendor actually sent at least one of these —
      // MockProvider never does, so mock-driven decisions cleanly omit this
      // rather than surfacing a whole object of nulls.
      if (credit_score !== undefined || delinquency_code !== undefined || is_guarantor !== undefined) {
        creditDetail = { score: credit_score ?? null, delinquencyCode: delinquency_code ?? null, isGuarantor: is_guarantor ?? null };
      }
    }

    const disbursementAccount = request.event_data?.disbursement_account;
    const accountNumber = disbursementAccount?.account_number;
    const bankId = disbursementAccount?.bank_id;

    if (accountNumber && bankId !== undefined && isValidBankId(bankId)) {
      const bank = await this.provider.getBankAccountName(accountNumber, bankId);
      const match = bank.status === "success" ? namesMatch(bank.data?.bank_account_name, identity.full_name) : null;
      outcomes.push({ key: "bank", status: bank.status, ...(match !== null ? { mismatch: !match } : {}) });
      signalsUsed.push(signalUsageFrom("bank_verification", bank, 2));
      if (match !== null) features["xcheck.bank_name_match"] = match;
    } else {
      // Never pass an unverified bank_id to Peleza — a bad id checks the
      // WRONG bank and would silently corrupt the mismatch signal.
      const reason = !accountNumber
        ? "no disbursement account in the request"
        : bankId === undefined
          ? "no bank_id supplied — bank check skipped"
          : "bank_id is not a recognized Peleza bank id";
      outcomes.push({ key: "bank", status: "skipped" });
      signalsUsed.push({ source: "bank_verification", status: "skipped", latency_ms: null, cost_tier: 2, reason });
    }

    const kraPin = request.event_data?.kra_pin;
    if (kraPin) {
      const kra = await this.provider.getKraTaxpayerName(kraPin);
      const match = kra.status === "success" ? namesMatch(kra.data?.kra_taxpayer_name, identity.full_name) : null;
      outcomes.push({ key: "kra", status: kra.status, ...(match !== null ? { mismatch: !match } : {}) });
      signalsUsed.push(signalUsageFrom("kra_verification", kra, 2));
      if (match !== null) features["xcheck.kra_name_match"] = match;
    } else {
      outcomes.push({ key: "kra", status: "skipped" });
      signalsUsed.push({ source: "kra_verification", status: "skipped", latency_ms: null, cost_tier: 2, reason: "no kra_pin in the request" });
    }

    return { outcomes, features, signalsUsed, ...(creditDetail ? { creditDetail } : {}) };
  }

  private async gatherTier2b(request: DecisionRequest, identity: IdentitySignal): Promise<TierGatherResult> {
    const dl = await this.provider.getDrivingLicence(request.subject.national_id);
    const match = dl.status === "success" ? datesMatch(dl.data?.dl_dob, identity.dob) : null;
    const outcomes: SignalOutcome[] = [{ key: "dl", status: dl.status, ...(match !== null ? { mismatch: !match } : {}) }];
    const features: Partial<Features> = match !== null ? { "xcheck.dl_dob_match": match } : {};
    return { outcomes, features, signalsUsed: [signalUsageFrom("driving_licence", dl, 2)] };
  }
}
