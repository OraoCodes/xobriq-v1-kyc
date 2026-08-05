import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackRequest } from "@xobriq/shared";
import type { FeedbackStore } from "../../../domain/ports/feedback-store.js";

export class SupabaseFeedbackStore implements FeedbackStore {
  constructor(private readonly client: SupabaseClient) {}

  async create(decisionId: string, customerId: string, feedback: FeedbackRequest): Promise<string> {
    const id = randomUUID();
    const { error } = await this.client.from("feedback").insert({
      id,
      decision_id: decisionId,
      outcome: feedback.outcome,
      fraud_type: feedback.fraud_type ?? null,
      loss_amount: feedback.loss_amount ?? null,
      reported_by_customer_id: customerId,
    });
    if (error) throw new Error(`failed to record feedback for decision ${decisionId}: ${error.message}`);
    return id;
  }
}
