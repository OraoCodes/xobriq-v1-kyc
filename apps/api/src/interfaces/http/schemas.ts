import { z } from "zod";
import { isValidBankId } from "@xobriq/shared";

/**
 * Zod at the edge only — mirrors @xobriq/shared's DecisionRequest so the
 * core keeps receiving typed, valid input. Kept in sync by hand; the shared
 * package is the source of truth for the TYPE, this is the source of truth
 * for the runtime shape check.
 */
export const DecisionRequestSchema = z.object({
  event_type: z.literal("loan_application"),
  reference_id: z.string().optional(),
  subject: z.object({
    national_id: z.string().min(1, "national_id is required"),
    phone: z.string().optional(),
  }),
  event_data: z
    .object({
      amount: z.number().optional(),
      currency: z.string().optional(),
      disbursement_account: z
        .object({
          account_name: z.string().optional(),
          account_number: z.string().optional(),
          bank_id: z.number().int().optional(),
        })
        .refine((val) => val.bank_id === undefined || isValidBankId(val.bank_id), {
          message: "bank_id is not a recognized Peleza bank id",
          path: ["bank_id"],
        })
        .optional(),
      kra_pin: z.string().optional(),
    })
    .optional(),
  initiated_by: z.enum(["api", "manual"]),
  initiated_by_user: z.string().optional(),
  device: z.object({ fingerprint: z.string().optional(), session_token: z.string().optional() }).optional(),
});

export const FeedbackRequestSchema = z.object({
  outcome: z.enum(["confirmed_fraud", "confirmed_legitimate", "false_positive", "suspected_fraud"]),
  fraud_type: z.string().optional(),
  loss_amount: z.number().optional(),
});

export const ResolveCaseSchema = z.object({
  resolution: z.string().min(1),
  reason_code: z.string().min(1),
  resolved_by: z.string().optional(),
});

export const ListDecisionsQuerySchema = z.object({
  initiated_by: z.enum(["api", "manual"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ListCasesQuerySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("must be a valid email"),
  password: z.string().min(1, "password is required"),
});
