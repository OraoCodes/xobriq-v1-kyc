"use client";

import { useCallback, useRef, useState } from "react";
import type { DecisionResponse } from "@xobriq/shared";
import { CheckForm, type CheckFormValues } from "./check-form";
import { Reveal } from "./reveal";
import { ResultView } from "./result-view";

type Stage =
  | { kind: "idle" }
  | { kind: "checking"; nationalId: string }
  | { kind: "result"; decision: DecisionResponse; nationalId: string }
  | { kind: "error"; message: string };

interface PendingResult {
  decision?: DecisionResponse;
  error?: string;
}

function errorMessageFor(code?: string, message?: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "Something about that applicant didn't look right. Check the national ID and try again.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "This portal isn't authorised to run checks. Contact your administrator.";
    case "RATE_LIMITED":
      return "Too many checks in a short time — wait a moment and try again.";
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_ERROR":
      return "A data source is unavailable right now. The check couldn't complete — try again shortly.";
    default:
      return message || "Couldn't reach the check service. Try again.";
  }
}

function buildRequestBody(values: CheckFormValues) {
  const hasDisbursementAccount = Boolean(values.account_name || values.account_number || values.bank_id !== undefined);
  const hasEventData = values.amount !== undefined || hasDisbursementAccount;
  return {
    event_type: "loan_application" as const,
    subject: {
      national_id: values.national_id,
      ...(values.phone ? { phone: values.phone } : {}),
    },
    ...(hasEventData
      ? {
          event_data: {
            ...(values.amount !== undefined ? { amount: values.amount, currency: "KES" } : {}),
            ...(hasDisbursementAccount
              ? {
                  disbursement_account: {
                    ...(values.account_name ? { account_name: values.account_name } : {}),
                    ...(values.account_number ? { account_number: values.account_number } : {}),
                    ...(values.bank_id !== undefined ? { bank_id: values.bank_id } : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    initiated_by: "manual" as const,
    ...(values.reference_id ? { reference_id: values.reference_id } : {}),
  };
}

export function CheckFlow({ initialReferenceId }: { initialReferenceId: string | null }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dataReady, setDataReady] = useState(false);
  const pendingResult = useRef<PendingResult | null>(null);

  const runCheck = useCallback(async (values: CheckFormValues) => {
    setStage({ kind: "checking", nationalId: values.national_id });
    setDataReady(false);
    pendingResult.current = null;

    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(values.live_check ? { "X-Xobriq-Live-Check": "true" } : {}),
        },
        body: JSON.stringify(buildRequestBody(values)),
      });
      const json = await res.json();
      pendingResult.current = res.ok
        ? { decision: json as DecisionResponse }
        : { error: errorMessageFor(json?.error?.code, json?.error?.message) };
    } catch {
      pendingResult.current = { error: "Couldn't reach the check service. Try again." };
    }
    setDataReady(true);
  }, []);

  const handleRevealComplete = useCallback(() => {
    const result = pendingResult.current;
    if (!result) return;
    if (result.error) {
      setStage({ kind: "error", message: result.error });
    } else if (result.decision) {
      const decision = result.decision;
      setStage((prev) => (prev.kind === "checking" ? { kind: "result", decision, nationalId: prev.nationalId } : prev));
    }
  }, []);

  const reset = useCallback(() => setStage({ kind: "idle" }), []);

  if (stage.kind === "idle" || stage.kind === "checking") {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center px-4 pb-16 pt-[28vh]">
        {stage.kind === "idle" && (
          <>
            <p className="mb-4 font-display text-lg italic text-ink-soft">Run a check</p>
            <CheckForm onSubmit={runCheck} disabled={false} initialReferenceId={initialReferenceId ?? undefined} />
          </>
        )}
        {stage.kind === "checking" && <Reveal dataReady={dataReady} onComplete={handleRevealComplete} />}
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center px-4 py-16">
      {stage.kind === "result" && <ResultView decision={stage.decision} nationalId={stage.nationalId} onRunAnother={reset} />}
      {stage.kind === "error" && (
        <div className="flex flex-1 max-w-md flex-col items-center justify-center gap-4 text-center">
          <p className="text-ink">{stage.message}</p>
          <button onClick={reset} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform active:scale-[0.98]">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
