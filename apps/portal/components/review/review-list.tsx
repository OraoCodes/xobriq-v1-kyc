"use client";

import { useEffect, useState } from "react";
import type { CaseView } from "@/lib/api-types";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

type LoadState = "loading" | "ready" | "error";

export function ReviewList() {
  const [items, setItems] = useState<CaseView[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/cases?status=open");
      if (!res.ok) throw new Error("failed");
      const data: { items: CaseView[] } = await res.json();
      setItems([...data.items].sort((a, b) => b.risk_score - a.risk_score));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (state === "loading") {
    return <div className="px-6 py-16 text-center text-sm text-ink-soft">Loading the review queue…</div>;
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-ink">Couldn't reach the check service. Try again.</p>
        <button onClick={load} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-hairline/40">
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <p className="text-ink-soft">Nothing to review — the queue is empty.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl italic text-ink">Review queue</h1>
        <span className="font-mono text-xs text-ink-soft">{items.length} open, sorted by exposure</span>
      </div>

      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`/review/${item.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-paper/60">
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-full border border-review/30 bg-review-tint px-2.5 py-1 text-xs font-medium text-review">
                  Risk {item.risk_score}
                </span>
                <span className="truncate font-mono text-sm text-ink-soft">case {item.id.slice(0, 8)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-4 font-mono text-xs text-ink-soft">
                <span className="hidden sm:inline">{formatDateTime(item.created_at)}</span>
                <span className="w-14 text-right">{formatRelativeTime(item.created_at)}</span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
