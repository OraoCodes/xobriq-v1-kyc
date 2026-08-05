import type { SignalUsage } from "@xobriq/shared";

const SOURCE_LABEL: Record<string, string> = {
  entity_graph: "Device & graph",
  iprs_identity: "IPRS identity",
  credit_bureau: "Credit bureau",
  bank_verification: "Bank verification",
  kra_verification: "KRA verification",
  driving_licence: "Driving licence",
  audit_chain: "Audit chain",
};

const STATUS_LABEL: Record<string, string> = {
  success: "ok",
  not_found: "not found",
  timeout: "timed out",
  error: "unavailable",
  skipped: "skipped",
};

export function SignalChips({ signals }: { signals: SignalUsage[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {signals.map((signal, i) => {
        const degraded = signal.status === "timeout" || signal.status === "error";
        return (
          <div
            key={`${signal.source}-${i}`}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              degraded ? "border-step-up/40 bg-step-up-tint" : "border-hairline bg-surface"
            }`}
            title={signal.reason}
          >
            <span className="font-medium text-ink">{SOURCE_LABEL[signal.source] ?? signal.source}</span>
            <span className="text-ink-soft">·</span>
            <span className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
              {signal.cost_tier === 0 ? "Free" : "Paid"}
            </span>
            <span className={degraded ? "text-step-up" : "text-ink-soft"}>{STATUS_LABEL[signal.status] ?? signal.status}</span>
            {signal.latency_ms !== null && <span className="font-mono text-ink-soft">{signal.latency_ms}ms</span>}
          </div>
        );
      })}
    </div>
  );
}
