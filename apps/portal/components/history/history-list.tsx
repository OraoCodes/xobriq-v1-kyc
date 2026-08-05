"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DecisionAction } from "@xobriq/shared";
import type { DecisionListItem, DecisionListResponse } from "@/lib/api-types";
import { VerdictTag } from "@/components/verdict-tag";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

const VERDICT_FILTERS: Array<{ label: string; value: DecisionAction | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Allow", value: "ALLOW" },
  { label: "Step up", value: "STEP_UP" },
  { label: "Review", value: "REVIEW" },
  { label: "Block", value: "BLOCK" },
];

const DATE_FILTERS = [
  { label: "Today", value: "today" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "All time", value: "all" as const },
];

type DateFilter = (typeof DATE_FILTERS)[number]["value"];

function withinDateFilter(iso: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const ageMs = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (filter === "today") return ageMs < day;
  if (filter === "7d") return ageMs < 7 * day;
  return ageMs < 30 * day;
}

type LoadState = "loading" | "ready" | "error";

export function HistoryList() {
  const router = useRouter();
  const [items, setItems] = useState<DecisionListItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<DecisionAction | "ALL">("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const PAGE_SIZE = 50;

  async function load(nextOffset: number) {
    setState("loading");
    try {
      const res = await fetch(`/api/decisions?initiated_by=manual&limit=${PAGE_SIZE}&offset=${nextOffset}`);
      if (!res.ok) throw new Error("failed");
      const data: DecisionListResponse = await res.json();
      setItems((prev) => (nextOffset === 0 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setOffset(nextOffset + data.items.length);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (verdictFilter !== "ALL" && item.recommended_action !== verdictFilter) return false;
      if (!withinDateFilter(item.created_at, dateFilter)) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const haystack = `${item.reference_id ?? ""} ${item.id}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, verdictFilter, dateFilter, query]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [filtered.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (filtered.length === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const item = filtered[focusedIndex];
        if (item) router.push(`/history/${item.id}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, focusedIndex, router]);

  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  if (state === "loading" && items.length === 0) {
    return <div className="px-6 py-16 text-center text-sm text-ink-soft">Loading history…</div>;
  }

  if (state === "error" && items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-ink">Couldn't reach the check service. Try again.</p>
        <button onClick={() => load(0)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-hairline/40">
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <p className="text-ink-soft">No checks yet — run your first check.</p>
        <a href="/" className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper">
          Run a check
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="font-display text-2xl italic text-ink">Check history</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder="Search by reference or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none sm:w-64"
          />
          <div className="flex flex-wrap gap-1.5">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  dateFilter === f.value ? "bg-ink text-paper" : "bg-surface text-ink-soft hover:bg-hairline/50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VERDICT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setVerdictFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                verdictFilter === f.value ? "border-ink bg-ink text-paper" : "border-hairline bg-surface text-ink-soft hover:bg-hairline/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-soft">No checks match this filter.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          {filtered.map((item, i) => (
            <li key={item.id}>
              <a
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                href={`/history/${item.id}`}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`flex items-center justify-between gap-4 px-4 py-3.5 transition-colors ${
                  i === focusedIndex ? "bg-paper" : "hover:bg-paper/60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <VerdictTag action={item.recommended_action} size="sm" />
                  <span className="truncate text-sm text-ink">{item.reference_id || `Check ${item.id.slice(0, 8)}`}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4 font-mono text-xs text-ink-soft">
                  <span>{item.confidence_score}% conf.</span>
                  <span className="hidden sm:inline">{formatDateTime(item.created_at)}</span>
                  <span className="w-14 text-right">{formatRelativeTime(item.created_at)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {offset < total && (
        <div className="mt-6 flex justify-center">
          <button onClick={() => load(offset)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-hairline/40">
            Load more ({total - offset} more)
          </button>
        </div>
      )}
    </div>
  );
}
