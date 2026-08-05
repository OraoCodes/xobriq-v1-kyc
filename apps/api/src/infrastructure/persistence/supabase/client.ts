import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client — the only writer. RLS is deny-all for
 * anon/authenticated (see migration 0001); the service-role key bypasses it
 * by design, so accidental cross-tenant access from a mis-scoped client is
 * structurally impossible (FOUNDATION §6.2). Never used from the portal.
 */
export function createSupabaseServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
