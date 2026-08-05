import type { IdentityProvider, IdentitySignal, CreditSignal, ProviderResult } from "../../../domain/ports/identity-provider.js";
import {
  parseIdentityEnvelope,
  parseBankEnvelope,
  parseKraEnvelope,
  parseDrivingLicenceEnvelope,
  parseCreditEnvelope,
} from "./parser.js";
import {
  IDENTITY_ENVELOPE_ALICE,
  BANK_ENVELOPE_ALICE,
  KRA_ENVELOPE_ALICE,
  DL_ENVELOPE_ALICE,
  CREDIT_ENVELOPE_ALICE,
} from "./fixtures/alice.js";

/**
 * PelezaProvider — proves the parsing/normalisation pipeline against the
 * real Peleza/IDM envelope shape (see types.ts). Serves one synthetic
 * fixture person, not a live feed: no HTTP client, no credentials, no real
 * PII. Its job is distinct from MockProvider's — MockProvider is the
 * multi-scenario sandbox the cascade is tested against; this class exists
 * only to prove the envelope→IdentitySignal parsing pipeline is correct and
 * yields the same normalised shape.
 *
 * Wiring a live feed later means replacing the body of each method with an
 * authenticated HTTP call that resolves to the same envelope type — the
 * parser and the port do not change.
 */
export class PelezaProvider implements IdentityProvider {
  async getIdentity(_nationalId: string): Promise<ProviderResult<IdentitySignal>> {
    // Live call slots in here: POST /v2/identity/verify { id_number: nationalId }
    return parseIdentityEnvelope(IDENTITY_ENVELOPE_ALICE);
  }

  async getCredit(_nationalId: string): Promise<ProviderResult<CreditSignal>> {
    // Live call slots in here — likely a distinct credit-bureau adapter in
    // production (see the note in types.ts on PelezaCreditEnvelope).
    return parseCreditEnvelope(CREDIT_ENVELOPE_ALICE);
  }

  async getBankAccountName(_accountNumber: string): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>> {
    // Live call slots in here: POST /v2/bank/verify { account_number }
    return parseBankEnvelope(BANK_ENVELOPE_ALICE);
  }

  async getKraTaxpayerName(_kraPin: string): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>> {
    // Live call slots in here: POST /v2/kra/verify { kra_pin }
    return parseKraEnvelope(KRA_ENVELOPE_ALICE);
  }

  async getDrivingLicence(_nationalId: string): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>> {
    // Live call slots in here: POST /v2/driving-licence/verify { id_number }
    return parseDrivingLicenceEnvelope(DL_ENVELOPE_ALICE);
  }
}
