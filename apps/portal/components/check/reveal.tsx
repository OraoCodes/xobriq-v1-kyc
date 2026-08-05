"use client";

import { useEffect, useState } from "react";

const STEPS = ["Identity · IPRS", "Credit history", "Device & network", "Consortium check"];
const STEP_ROW_MS = 280;
const HOLD_MS = 500;

/**
 * The signature. Plays its own investigative pacing regardless of when the
 * real response arrives — `dataReady` only gates the final hand-off, so a
 * fast response never feels rushed and a slow one never feels stuck (the
 * completed tick-row is itself an honest "still working" resting state).
 */
export function Reveal({ dataReady, onComplete }: { dataReady: boolean; onComplete: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [staggerDone, setStaggerDone] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(STEPS.length);
      setStaggerDone(true);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = STEPS.map((_, i) =>
      setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * STEP_ROW_MS),
    );
    timers.push(setTimeout(() => setStaggerDone(true), STEPS.length * STEP_ROW_MS));
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  useEffect(() => {
    if (!staggerDone || !dataReady) return;
    const t = setTimeout(onComplete, reducedMotion ? 0 : HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staggerDone, dataReady]);

  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-md flex-col gap-3">
      <span className="sr-only">Running the check…</span>
      {STEPS.map((label, i) => {
        const visible = i < visibleCount;
        const isLast = i === STEPS.length - 1;
        const waiting = visible && isLast && staggerDone && !dataReady;
        return (
          <div key={label} className={`flex items-center gap-3 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface ${visible && !reducedMotion ? "animate-tick-in" : ""}`}
            >
              {visible &&
                (waiting ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft" aria-hidden="true" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ))}
            </span>
            <span className="font-mono text-sm text-ink-soft">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
