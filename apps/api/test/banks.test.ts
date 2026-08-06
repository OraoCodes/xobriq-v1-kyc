import { describe, it, expect } from "vitest";
import { BANKS, bankById, isValidBankId } from "@xobriq/shared";

describe("@xobriq/shared banks — the single source of truth for Peleza bank_id", () => {
  it("exports 42 banks with unique, positive integer ids", () => {
    expect(BANKS.length).toBe(42);
    const ids = BANKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
  });

  it("bankById resolves a known id and returns undefined for an unknown one", () => {
    expect(bankById(34)?.name).toBe("Equity Bank");
    expect(bankById(99999)).toBeUndefined();
  });

  it("isValidBankId agrees with bankById", () => {
    expect(isValidBankId(34)).toBe(true);
    expect(isValidBankId(99999)).toBe(false);
  });
});
