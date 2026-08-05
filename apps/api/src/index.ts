import { buildApp } from "./interfaces/http/app.js";
import { createSupabaseServiceClient } from "./infrastructure/persistence/supabase/client.js";
import { SupabaseDecisionRepository } from "./infrastructure/persistence/supabase/decision-repository.js";
import { SupabaseAuditLog } from "./infrastructure/persistence/supabase/audit-log.js";
import { SupabaseEntityGraph } from "./infrastructure/persistence/supabase/entity-graph.js";
import { SupabaseCaseStore } from "./infrastructure/persistence/supabase/case-store.js";
import { SupabaseFeedbackStore } from "./infrastructure/persistence/supabase/feedback-store.js";
import { SupabaseApiKeyStore } from "./infrastructure/persistence/supabase/api-key-store.js";
import { SupabaseOperatorStore } from "./infrastructure/persistence/supabase/operator-store.js";
import { SupabaseSessionStore } from "./infrastructure/persistence/supabase/session-store.js";
import { SupabaseCustomerStore } from "./infrastructure/persistence/supabase/customer-store.js";
import { MockProvider } from "./infrastructure/providers/mock/mock-provider.js";
import { PelezaProvider } from "./infrastructure/providers/peleza/peleza-provider.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const client = createSupabaseServiceClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
const pepper = requireEnv("ENTITY_HASH_PEPPER");

const app = buildApp({
  keyStore: new SupabaseApiKeyStore(client),
  operators: new SupabaseOperatorStore(client),
  sessions: new SupabaseSessionStore(client),
  customers: new SupabaseCustomerStore(client),
  decisions: new SupabaseDecisionRepository(client),
  audit: new SupabaseAuditLog(client),
  graph: new SupabaseEntityGraph(client, pepper),
  cases: new SupabaseCaseStore(client),
  feedback: new SupabaseFeedbackStore(client),
  providers: { test: new MockProvider(), live: new PelezaProvider() },
});

const port = Number(process.env.PORT) || 3000;
app
  .listen({ port, host: "0.0.0.0" })
  // app.log is a no-op (logger: false) — console.log so a manual `tsx src/index.ts` run isn't silent.
  .then(() => console.log(`xobriq api listening on :${port}`))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
