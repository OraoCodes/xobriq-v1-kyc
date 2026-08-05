"use client";

import { useEffect, useState } from "react";
import type { DecisionResponse } from "@xobriq/shared";
import { maskId } from "@/lib/format";
import { buildCounterfactual } from "@/lib/counterfactual";
import { buildEvidencePack } from "@/lib/evidence-pack";
import { DecisionCore } from "@/components/check/decision-core";
import type { CaseView } from "@/lib/api-types";

function useLinkedCase(decision: DecisionResponse): CaseView | null | "loading" {
  const [linkedCase, setLinkedCase] = useState<CaseView | null | "loading">(
    decision.recommended_action === "REVIEW" ? "loading" : null,
  );

  useEffect(() => {
    if (decision.recommended_action !== "REVIEW") return;
    let cancelled = false;
    fetch("/api/cases?status=open")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: CaseView[] } | null) => {
        if (cancelled) return;
        const match = data?.items.find((c) => c.decision_id === decision.id) ?? null;
        setLinkedCase(match);
      })
      .catch(() => !cancelled && setLinkedCase(null));
    return () => {
      cancelled = true;
    };
  }, [decision.id, decision.recommended_action]);

  return linkedCase;
}

export function ResultView({
  decision,
  nationalId,
  onRunAnother,
}: {
  decision: DecisionResponse;
  nationalId: string;
  onRunAnother: () => void;
}) {
  const linkedCase = useLinkedCase(decision);

  return (
    <div className="w-full max-w-3xl animate-verdict-in">
      <DecisionCore decision={decision} subtitle={maskId(nationalId)} />

      {decision.recommended_action === "STEP_UP" && decision.step_up_options.length > 0 && (
        <section className="mt-6 rounded-xl border border-step-up/25 bg-step-up-tint p-5">
          <h2 className="text-sm font-medium text-ink">Ways to raise confidence</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {decision.step_up_options.map((opt) => (
              <li key={opt.method} className="flex items-center justify-between text-sm text-ink-soft">
                <span className="capitalize">{opt.method.replace(/_/g, " ")}</span>
                <span className="font-mono text-xs">+{opt.expected_confidence_gain} confidence</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {decision.recommended_action === "REVIEW" && (
        <section className="mt-6 rounded-xl border border-review/25 bg-review-tint p-5">
          <h2 className="text-sm font-medium text-ink">Sent to the review queue</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {linkedCase === "loading"
              ? "Locating the case…"
              : linkedCase
                ? "A human needs to resolve this with a reason code before it's final."
                : "This decision opened a review case — check the review queue."}
          </p>
          {linkedCase && linkedCase !== "loading" && (
            <a href={`/review/${linkedCase.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-review hover:underline">
              Open in review queue →
            </a>
          )}
        </section>
      )}

      <div className="no-print mt-10 flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
        <button
          onClick={onRunAnother}
          autoFocus
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform active:scale-[0.98]"
        >
          Run another check
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-xl border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-hairline/40"
        >
          Save / print evidence
        </button>
        <span className="ml-auto font-mono text-xs text-ink-soft">audit {decision.audit_id.slice(0, 8)}</span>
      </div>

      <PrintSummary decision={decision} nationalId={nationalId} />
    </div>
  );
}

function PrintSummary({ decision, nationalId }: { decision: DecisionResponse; nationalId: string }) {
  const counterfactual = buildCounterfactual(decision);
  const evidence = buildEvidencePack(decision);
  return (
    <div className="print-only mt-8 text-ink">
      <h1 className="font-display text-2xl">Xobriq — check evidence summary</h1>
      <p className="mt-1 font-mono text-xs">
        {maskId(nationalId)} · {decision.created_at} · audit {decision.audit_id}
      </p>
      <p className="mt-4 text-lg font-medium">
        {decision.recommended_action} — risk {decision.risk_score}/1000, confidence {decision.confidence_score}/100
      </p>
      <p className="mt-2 font-display text-xl italic">{counterfactual}</p>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide">Evidence</h2>
      <ul className="mt-2 text-sm">
        {evidence.map((item) => (
          <li key={item.key}>
            {item.label}: {item.detail}
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide">Reasons</h2>
      <ul className="mt-2 text-sm">
        {decision.risk_reasons.map((r) => (
          <li key={r.code}>
            {r.code}: {r.direction === "increases_risk" ? "+" : "−"}
            {Math.abs(r.weight)}
          </li>
        ))}
      </ul>
    </div>
  );
}
