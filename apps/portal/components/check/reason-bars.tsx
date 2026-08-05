import type { RiskReason } from "@xobriq/shared";

function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function ReasonBars({ reasons }: { reasons: RiskReason[] }) {
  if (reasons.length === 0) {
    return <p className="text-sm text-ink-soft">No weighted reasons contributed to this score.</p>;
  }

  const maxAbs = Math.max(...reasons.map((r) => Math.abs(r.weight)), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {reasons.map((reason) => {
        const raises = reason.direction === "increases_risk";
        const widthPct = (Math.abs(reason.weight) / maxAbs) * 50;
        return (
          <div key={reason.code} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[11rem_1fr_auto]">
            <span className="truncate text-sm text-ink" title={reason.code}>
              {humanizeCode(reason.code)}
            </span>
            <div className="relative hidden h-4 sm:block">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-hairline" aria-hidden="true" />
              <div
                className={`absolute top-0.5 h-3 rounded-sm ${raises ? "bg-block/70" : "bg-allow/70"}`}
                style={raises ? { left: "50%", width: `${widthPct}%` } : { right: "50%", width: `${widthPct}%` }}
              />
            </div>
            <span className={`text-right font-mono text-xs ${raises ? "text-block" : "text-allow"}`}>
              {raises ? "+" : "−"}
              {Math.abs(reason.weight)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
