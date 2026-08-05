import type { FeedbackRequest } from "@xobriq/shared";

export interface FeedbackStore {
  create(decisionId: string, customerId: string, feedback: FeedbackRequest): Promise<string>;
}
