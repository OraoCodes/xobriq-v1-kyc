import type { DecisionAction, RiskBand, RiskReason, SignalUsage } from "@xobriq/shared";
import { VerdictStamp } from "@/components/verdict-stamp";
import { VERDICT_CLASSES, formatDateTime } from "@/lib/format";
import { buildCounterfactual } from "@/lib/counterfactual";
import { buildEvidencePack } from "@/lib/evidence-pack";
import { EvidenceGrid } from "@/components/check/evidence-grid";
import { ReasonBars } from "@/components/check/reason-bars";
import { SignalChips } from "@/components/check/signal-chips";

export interface DecisionCoreData {
  recommended_action: DecisionAction;
  risk_score: number;
  risk_band: RiskBand;
  confidence_score: number;
  risk_reasons: RiskReason[];
  signals_used: SignalUsage[];
  created_at: string;
  latency_ms: number | null;
}

/**
 * The shared heart of every decision view: verdict wash, counterfactual,
 * evidence, why, signals. Used by the live check result, check history
 * detail, and review case detail — one rendering of "what did we decide and
 * why," never re-derived three different ways.
 */
export function DecisionCore({ decision, subtitle }: { decision: DecisionCoreData; subtitle?: string }) {
  const classes = VERDICT_CLASSES[decision.recommended_action];
  const counterfactual = buildCounterfactual(decision);
  const evidence = buildEvidencePack(decision);

  return (
    <div className="w-full">
      <section className={`rounded-2xl border ${classes.border}/25 ${classes.tint} px-6 py-10 sm:px-10 sm:py-12`}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <VerdictStamp action={decision.recommended_action} />
          {subtitle && <span className="font-mono text-xs text-ink-soft">{subtitle}</span>}
        </div>
        <p className="font-display text-[1.625rem] italic leading-[1.28] text-ink sm:text-[2rem]">{counterfactual}</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-ink-soft">
          <span>
            Risk score <strong className="text-ink">{decision.risk_score}</strong>/1000 · {decision.risk_band}
          </span>
          <span>
            Confidence <strong className="text-ink">{decision.confidence_score}</strong>/100
          </span>
          <span>{formatDateTime(decision.created_at)}</span>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink-soft">Evidence</h2>
        <EvidenceGrid items={evidence} />
      </section>

      <details className="group mt-6 rounded-xl border border-hairline bg-surface p-5" open>
        <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft marker:content-none">
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="transition-transform group-open:rotate-90">
              <path d="M5 3l6 5-6 5V3z" />
            </svg>
            Why
          </span>
        </summary>
        <div className="mt-4">
          <ReasonBars reasons={decision.risk_reasons} />
        </div>
      </details>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-ink-soft">Signals consulted</h2>
        <SignalChips signals={decision.signals_used} />
      </section>
    </div>
  );
}
