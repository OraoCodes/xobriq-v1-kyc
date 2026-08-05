/**
 * Hand-onboarding, by design — there is no public "create your organization"
 * form. Run this once per partner:
 *
 *   npx tsx scripts/provision-org.ts "Acme Lending" admin@acme.com [password]
 *
 * Creates the customer, one admin operator, and an sk_test_/sk_live_ key
 * pair. Prints the login and both raw keys ONCE — nothing here is
 * retrievable again after this run; only hashes are stored.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { createSupabaseServiceClient } from "../src/infrastructure/persistence/supabase/client.js";
import { SupabaseOperatorStore } from "../src/infrastructure/persistence/supabase/operator-store.js";
import { SupabaseApiKeyStore } from "../src/infrastructure/persistence/supabase/api-key-store.js";
import { hashPassword } from "../src/infrastructure/security/password.js";
import { generateApiKey, hashApiKey, keyPrefixOf } from "../src/infrastructure/security/api-key.js";
import { FULL_SCOPES, type ApiKeyMode } from "../src/domain/ports/api-key-store.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

async function main(): Promise<void> {
  const [orgName, adminEmail, providedPassword] = process.argv.slice(2);
  if (!orgName || !adminEmail) {
    console.error('Usage: npx tsx scripts/provision-org.ts "Org Name" admin@example.com [password]');
    process.exit(1);
  }

  const client = createSupabaseServiceClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const apiKeys = new SupabaseApiKeyStore(client);
  const operators = new SupabaseOperatorStore(client);

  const password = providedPassword ?? randomBytes(12).toString("base64url");
  const customerId = `cust_${randomUUID().slice(0, 8)}`;
  const operatorId = `op_${randomUUID().slice(0, 8)}`;

  const { error: customerError } = await client.from("customers").insert({ id: customerId, name: orgName });
  if (customerError) throw new Error(`failed to create customer: ${customerError.message}`);

  await operators.createOperator({
    id: operatorId,
    customerId,
    email: adminEmail,
    passwordHash: await hashPassword(password),
    role: "admin",
  });

  const rawKeys: Record<ApiKeyMode, string> = { test: "", live: "" };
  for (const mode of ["test", "live"] as const) {
    const raw = generateApiKey(mode);
    rawKeys[mode] = raw;
    await apiKeys.createKey({
      id: `key_${randomUUID().slice(0, 8)}`,
      customerId,
      customerName: orgName,
      mode,
      keyHash: hashApiKey(raw),
      keyPrefix: keyPrefixOf(raw),
      scopes: FULL_SCOPES,
    });
  }

  console.log("\nOrg provisioned — save this now, it's shown exactly once:\n");
  console.log(`  Organization : ${orgName}  (${customerId})`);
  console.log(`  Login email  : ${adminEmail}`);
  console.log(`  Password     : ${password}`);
  console.log(`  Test key     : ${rawKeys.test}`);
  console.log(`  Live key     : ${rawKeys.live}`);
  console.log("");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
