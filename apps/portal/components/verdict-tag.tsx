import type { DecisionAction } from "@xobriq/shared";
import { VERDICT_LABEL, VERDICT_CLASSES } from "@/lib/format";

export const VERDICT_ICON_PATH: Record<DecisionAction, string> = {
  ALLOW: "M4 8.5l2.5 2.5L12 5",
  STEP_UP: "M8 12V4M4.5 7.5L8 4l3.5 3.5",
  REVIEW: "M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z",
  BLOCK: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

export function VerdictTag({ action, size = "md" }: { action: DecisionAction; size?: "sm" | "md" | "lg" }) {
  const classes = VERDICT_CLASSES[action];
  const dims = size === "lg" ? "text-sm px-3.5 py-2 gap-2" : size === "sm" ? "text-xs px-2 py-1 gap-1" : "text-xs px-2.5 py-1.5 gap-1.5";
  const iconSize = size === "lg" ? 16 : 12;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${classes.tint} ${classes.text} ${classes.border}/30 ${dims}`}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={VERDICT_ICON_PATH[action]} />
      </svg>
      {VERDICT_LABEL[action]}
    </span>
  );
}
