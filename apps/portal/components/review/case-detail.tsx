"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseView, DecisionDetail } from "@/lib/api-types";
import { DecisionCore } from "@/components/check/decision-core";
import { ResolveModal, RESOLUTION_LABEL, type ResolutionKind } from "@/components/review/resolve-modal";

type LoadState = "loading" | "ready" | "error" | "not_found";

const KEY_TO_RESOLUTION: Record<string, ResolutionKind> = { a: "approved", b: "blocked", s: "step_up", e: "escalated" };

export function CaseDetail({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [caseRecord, setCaseRecord] = useState<CaseView | null>(null);
  const [decision, setDecision] = useState<DecisionDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [pendingResolution, setPendingResolution] = useState<ResolutionKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const caseRes = await fetch(`/api/cases/${caseId}`);
      if (caseRes.status === 404) {
        setState("not_found");
        return;
      }
      if (!caseRes.ok) throw new Error("failed");
      const caseData: CaseView = await caseRes.json();
      setCaseRecord(caseData);

      const decisionRes = await fetch(`/api/decisions/${caseData.decision_id}`);
      if (decisionRes.ok) setDecision(await decisionRes.json());

      setState("ready");
    } catch {
      setState("error");
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (pendingResolution || state !== "ready" || caseRecord?.status !== "open") return;
      const resolution = KEY_TO_RESOLUTION[e.key.toLowerCase()];
      if (resolution) {
        e.preventDefault();
        setPendingResolution(resolution);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingResolution, state, caseRecord]);

  async function confirmResolve(reasonCode: string) {
    if (!pendingResolution) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: pendingResolution, reason_code: reasonCode }),
      });
      if (res.status === 409) {
        setConflict(true);
        setPendingResolution(null);
        await load();
        return;
      }
      if (!res.ok) throw new Error("failed");

      setToast(`Resolved as ${RESOLUTION_LABEL[pendingResolution]} — moving to the next case`);
      setPendingResolution(null);

      const nextRes = await fetch("/api/cases?status=open");
      const nextData: { items: CaseView[] } = nextRes.ok ? await nextRes.json() : { items: [] };
      const next = nextData.items.find((c) => c.id !== caseId);

      setTimeout(() => {
        router.push(next ? `/review/${next.id}` : "/review");
      }, 850);
    } catch {
      setToast("Couldn't save — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") {
    return <div className="px-6 py-16 text-center text-sm text-ink-soft">Loading case…</div>;
  }

  if (state === "not_found") {
    return <div className="px-6 py-16 text-center text-sm text-ink-soft">This case doesn't exist or belongs to another customer.</div>;
  }

  if (state === "error" || !caseRecord) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-ink">Couldn't reach the check service. Try again.</p>
        <button onClick={load} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-hairline/40">
          Retry
        </button>
      </div>
    );
  }

  const alreadyResolved = caseRecord.status !== "open";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <a href="/review" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        ← Back to queue
      </a>

      {conflict && (
        <div className="mb-4 rounded-lg border border-step-up/30 bg-step-up-tint px-4 py-3 text-sm text-ink">
          This case was already resolved — showing the latest state.
        </div>
      )}

      {decision ? (
        <DecisionCore decision={decision} subtitle={`case ${caseRecord.id.slice(0, 8)}`} />
      ) : (
        <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-sm text-ink-soft">
          The underlying decision couldn't be loaded.
        </div>
      )}

      {alreadyResolved ? (
        <div className="mt-8 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">
            Resolved as {caseRecord.resolution} — {caseRecord.reason_code}
          </h2>
          {caseRecord.resolved_at && <p className="mt-1 text-xs text-ink-soft">{caseRecord.resolved_at}</p>}
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-hairline pt-6">
          <ActionButton label="Approve" shortcut="A" onClick={() => setPendingResolution("approved")} />
          <ActionButton label="Block" shortcut="B" onClick={() => setPendingResolution("blocked")} />
          <ActionButton label="Step up" shortcut="S" onClick={() => setPendingResolution("step_up")} />
          <ActionButton label="Escalate" shortcut="E" onClick={() => setPendingResolution("escalated")} />
        </div>
      )}

      {pendingResolution && (
        <ResolveModal resolution={pendingResolution} submitting={submitting} onCancel={() => setPendingResolution(null)} onConfirm={confirmResolve} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function ActionButton({ label, shortcut, onClick }: { label: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
    >
      {label}
      <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">{shortcut}</span>
    </button>
  );
}
