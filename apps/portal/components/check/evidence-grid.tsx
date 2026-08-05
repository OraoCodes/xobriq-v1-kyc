import type { EvidenceItem, EvidenceStatus } from "@/lib/evidence-pack";

const STATUS_STYLES: Record<EvidenceStatus, { dot: string; text: string }> = {
  pass: { dot: "bg-allow", text: "text-ink-soft" },
  warn: { dot: "bg-step-up", text: "text-ink" },
  fail: { dot: "bg-block", text: "text-ink" },
  unavailable: { dot: "bg-ink-soft/40", text: "text-ink-soft" },
};

export function EvidenceGrid({ items }: { items: EvidenceItem[] }) {
  return (
    <div className="flex flex-wrap gap-px overflow-hidden rounded-xl border border-hairline bg-hairline">
      {items.map((item) => {
        const style = STATUS_STYLES[item.status];
        return (
          <div key={item.key} className="flex min-w-[13rem] flex-1 basis-64 flex-col gap-1.5 bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
              <span className="text-sm font-medium text-ink">{item.label}</span>
            </div>
            <p className={`text-xs leading-relaxed ${style.text}`}>{item.detail}</p>
          </div>
        );
      })}
    </div>
  );
}
