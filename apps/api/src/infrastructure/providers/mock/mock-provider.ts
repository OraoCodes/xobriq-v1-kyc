import type {
  IdentityProvider,
  IdentitySignal,
  CreditSignal,
  ProviderResult,
} from "../../../domain/ports/identity-provider.js";
import { findPersona } from "./personas.js";

function success<T>(data: T, latencyMs: number): ProviderResult<T> {
  return { status: "success", data, latencyMs };
}

function notFound<T>(latencyMs: number): ProviderResult<T> {
  return { status: "not_found", data: null, latencyMs };
}

function timeout<T>(latencyMs: number, source: string): ProviderResult<T> {
  return { status: "timeout", data: null, latencyMs, error: `${source} request exceeded timeout budget` };
}

/**
 * MockProvider — deterministic sandbox personas keyed by national_id. See
 * personas.ts for the fixture table and the seven-persona acceptance spec.
 */
export class MockProvider implements IdentityProvider {
  async getIdentity(nationalId: string): Promise<ProviderResult<IdentitySignal>> {
    const persona = findPersona(nationalId);
    if (!persona) return notFound(25);

    const signal: IdentitySignal = {
      id_valid: persona.identity.id_valid,
      full_name: persona.identity.full_name,
      dob: persona.identity.dob,
      gender: persona.identity.gender,
    };
    if (persona.identity.phone_on_record) signal.phone_on_record = persona.identity.phone_on_record;
    return success(signal, 40);
  }

  async getCredit(nationalId: string): Promise<ProviderResult<CreditSignal>> {
    const persona = findPersona(nationalId);
    if (!persona) return notFound(30);

    if (persona.credit.kind === "timeout") return timeout(5000, "creditinfo");
    if (persona.credit.kind === "not_found") return notFound(120);
    return success(persona.credit.signal, 120);
  }

  async getBankAccountName(accountNumber: string): Promise<ProviderResult<Pick<IdentitySignal, "bank_account_name">>> {
    const persona = findPersona(accountNumber);
    if (!persona || persona.bank_account_name === null) return notFound(90);
    return success({ bank_account_name: persona.bank_account_name }, 90);
  }

  async getKraTaxpayerName(kraPin: string): Promise<ProviderResult<Pick<IdentitySignal, "kra_taxpayer_name">>> {
    const persona = findPersona(kraPin);
    if (!persona || persona.kra_taxpayer_name === null) return notFound(150);
    return success({ kra_taxpayer_name: persona.kra_taxpayer_name }, 150);
  }

  async getDrivingLicence(nationalId: string): Promise<ProviderResult<Pick<IdentitySignal, "dl_dob">>> {
    const persona = findPersona(nationalId);
    if (!persona || persona.dl_dob === null) return notFound(110);
    return success({ dl_dob: persona.dl_dob }, 110);
  }
}
