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
  /** Absent for decisions fetched from history/review (not persisted) — only present on a fresh result. */
  mode?: "test" | "live";
  applicant?: { full_name: string | null };
  credit_detail?: { score: string | null; delinquency_code: string | null; is_guarantor: boolean | null };
}

function ModeBadge({ mode }: { mode: "test" | "live" }) {
  const isLive = mode === "live";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide ${
        isLive ? "border-block/40 bg-block-tint text-block" : "border-hairline bg-paper text-ink-soft"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-block" : "bg-ink-soft"}`} />
      {isLive ? "Live · Peleza" : "Mock · Demo"}
    </span>
  );
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
          <div className="flex items-center gap-3">
            {decision.mode && <ModeBadge mode={decision.mode} />}
            {subtitle && <span className="font-mono text-xs text-ink-soft">{subtitle}</span>}
          </div>
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

      {(decision.applicant || decision.credit_detail) && (
        <details className="group mt-6 rounded-xl border border-hairline bg-surface p-5">
          <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="transition-transform group-open:rotate-90">
                <path d="M5 3l6 5-6 5V3z" />
              </svg>
              Applicant &amp; credit detail
              <span className="font-normal text-ink-soft/70">— for digging deeper</span>
            </span>
          </summary>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {decision.applicant && (
              <div>
                <dt className="text-xs text-ink-soft">Full name (from identity check)</dt>
                <dd className="mt-0.5 text-ink">{decision.applicant.full_name ?? "Not resolved"}</dd>
              </div>
            )}
            {decision.credit_detail?.score !== null && decision.credit_detail?.score !== undefined && (
              <div>
                <dt className="text-xs text-ink-soft">Credit score</dt>
                <dd className="mt-0.5 font-mono text-ink">{decision.credit_detail.score}</dd>
              </div>
            )}
            {decision.credit_detail?.delinquency_code !== null && decision.credit_detail?.delinquency_code !== undefined && (
              <div>
                <dt className="text-xs text-ink-soft">Delinquency code</dt>
                <dd className="mt-0.5 font-mono text-ink">{decision.credit_detail.delinquency_code}</dd>
              </div>
            )}
            {decision.credit_detail?.is_guarantor !== null && decision.credit_detail?.is_guarantor !== undefined && (
              <div>
                <dt className="text-xs text-ink-soft">Is guarantor elsewhere</dt>
                <dd className="mt-0.5 text-ink">{decision.credit_detail.is_guarantor ? "Yes" : "No"}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
