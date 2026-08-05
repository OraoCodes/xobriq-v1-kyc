import type { DecisionAction } from "@xobriq/shared";
import { VERDICT_LABEL, VERDICT_CLASSES } from "@/lib/format";
import { VERDICT_ICON_PATH } from "@/components/verdict-tag";

/**
 * The hero-card verdict — a co-headline with the serif sentence, not a
 * footnote pill. Solid verdict color on the icon badge (not the whisper
 * tint) so it reads as the anchor of the card from across the room.
 */
export function VerdictStamp({ action }: { action: DecisionAction }) {
  const classes = VERDICT_CLASSES[action];

  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${classes.bg} shadow-sm`}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#FAF8F3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={VERDICT_ICON_PATH[action]} />
        </svg>
      </span>
      <span className={`text-2xl font-semibold tracking-tight ${classes.text} sm:text-[1.75rem]`}>{VERDICT_LABEL[action]}</span>
    </div>
  );
}
