import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionStore, SessionRecord, NewSession } from "../../../domain/ports/session-store.js";

export class SupabaseSessionStore implements SessionStore {
  constructor(private readonly client: SupabaseClient) {}

  async createSession(session: NewSession): Promise<void> {
    const { error } = await this.client.from("account_sessions").insert({
      id: session.id,
      token_hash: session.tokenHash,
      customer_id: session.customerId,
      user_email: session.userEmail,
      expires_at: session.expiresAt,
    });
    if (error) throw new Error(`failed to create session: ${error.message}`);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const { data: session, error } = await this.client
      .from("account_sessions")
      .select("id, customer_id, user_email, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(`failed to look up session: ${error.message}`);
    if (!session || !session.user_email) return null;

    // account_sessions has no FK to operators (user_email is a plain column) —
    // resolved with a second lookup rather than relying on an embed Supabase can't infer.
    const { data: operator, error: operatorError } = await this.client
      .from("operators")
      .select("role")
      .eq("email", session.user_email)
      .eq("customer_id", session.customer_id)
      .maybeSingle();
    if (operatorError) throw new Error(`failed to resolve session operator: ${operatorError.message}`);
    if (!operator) return null;

    return {
      id: session.id,
      customerId: session.customer_id,
      userEmail: session.user_email,
      role: operator.role,
      expiresAt: session.expires_at,
    };
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.client.from("account_sessions").delete().eq("id", id);
    if (error) throw new Error(`failed to delete session: ${error.message}`);
  }
}
