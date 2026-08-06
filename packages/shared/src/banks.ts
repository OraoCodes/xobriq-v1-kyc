/**
 * Peleza bank list — the canonical {id, name} mapping Peleza's bank-account
 * verification endpoint expects for its `bank_id` parameter.
 *
 * SOURCE: Peleza "Available Banks" table (verified, not guessed). These IDs are
 * fraud-critical: a wrong id checks an account at the WRONG bank and silently
 * corrupts the name-mismatch signal. Do not edit without re-verifying against
 * Peleza. If Peleza exposes a live "list banks" endpoint, this static list can
 * be refreshed from it, but a shipped list avoids a runtime dependency (banks
 * change rarely).
 *
 * Single source of truth: imported by both @xobriq/api (to validate/thread
 * bank_id) and @xobriq/portal (to populate the bank selector).
 */

export interface Bank {
  id: number;
  name: string;
}

export const BANKS: readonly Bank[] = [
  { id: 1, name: "KCB" },
  { id: 2, name: "Standard Chartered Bank" },
  { id: 3, name: "Absa Bank" },
  { id: 4, name: "Bank of India" },
  { id: 5, name: "Bank of Baroda" },
  { id: 6, name: "NCBA" },
  { id: 7, name: "Prime Bank" },
  { id: 8, name: "Co-operative Bank" },
  { id: 9, name: "National Bank" },
  { id: 10, name: "M-Oriental" },
  { id: 11, name: "Citi Bank" },
  { id: 12, name: "Habib Bank AG Zurich" },
  { id: 13, name: "Middle East Bank" },
  { id: 14, name: "Bank of Africa" },
  { id: 15, name: "Consolidated Bank" },
  { id: 16, name: "Credit Bank" },
  { id: 17, name: "Access Bank" },
  { id: 18, name: "Stanbic Bank" },
  { id: 19, name: "ABC Bank" },
  { id: 20, name: "Eco Bank" },
  { id: 21, name: "SPIRE Bank" },
  { id: 22, name: "Paramount" },
  { id: 23, name: "Kingdom Bank" },
  { id: 24, name: "Guaranty Trust Bank (GT Bank)" },
  { id: 25, name: "Victoria Bank" },
  { id: 26, name: "Guardian Bank" },
  { id: 27, name: "I&M Bank" },
  { id: 28, name: "Development Bank" },
  { id: 29, name: "SBM" },
  { id: 30, name: "Housing Finance" },
  { id: 31, name: "Diamond Trust Bank (DTB)" },
  { id: 32, name: "Mayfair Bank" },
  { id: 33, name: "Sidian Bank" },
  { id: 34, name: "Equity Bank" },
  { id: 35, name: "Family Bank" },
  { id: 36, name: "Gulf African Bank" },
  { id: 37, name: "First Community Bank" },
  { id: 38, name: "DIB Bank" },
  { id: 39, name: "UBA Bank" },
  { id: 40, name: "KWFT" },
  { id: 41, name: "Faulu Bank" },
  { id: 42, name: "Post Bank" },
];

const BANK_BY_ID = new Map<number, Bank>(BANKS.map((b) => [b.id, b]));

/** Look up a bank by its Peleza id. Returns undefined for unknown ids. */
export function bankById(id: number): Bank | undefined {
  return BANK_BY_ID.get(id);
}

/** True if the given id is a known Peleza bank id. */
export function isValidBankId(id: number): boolean {
  return BANK_BY_ID.has(id);
}
