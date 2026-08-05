"use client";

import { useEffect, useState } from "react";

export type ResolutionKind = "approved" | "blocked" | "step_up" | "escalated";

export const RESOLUTION_LABEL: Record<ResolutionKind, string> = {
  approved: "Approve",
  blocked: "Block",
  step_up: "Step up",
  escalated: "Escalate",
};

const REASON_CODES: Array<{ value: string; label: string }> = [
  { value: "device_family_shared", label: "Shared device explained (family / agent)" },
  { value: "identity_mismatch_confirmed", label: "Identity mismatch confirmed" },
  { value: "confirmed_fraud_ring", label: "Confirmed fraud ring" },
  { value: "false_positive_verified", label: "False positive — verified clean" },
  { value: "insufficient_evidence", label: "Insufficient evidence to act" },
  { value: "escalated_to_compliance", label: "Escalated to compliance" },
  { value: "other", label: "Other (see notes)" },
];

export function ResolveModal({
  resolution,
  submitting,
  onCancel,
  onConfirm,
}: {
  resolution: ResolutionKind;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (reasonCode: string) => void;
}) {
  const [reasonCode, setReasonCode] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label="Resolve case">
      <div className="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl">
        <h2 className="text-sm font-medium text-ink-soft">Resolving as</h2>
        <p className="mt-1 text-lg font-medium text-ink">{RESOLUTION_LABEL[resolution]}</p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">
            Reason code <span className="text-block">*</span> — the training label
          </span>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none"
          >
            <option value="" disabled>
              Select a reason…
            </option>
            {REASON_CODES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink">
            Cancel (Esc)
          </button>
          <button
            onClick={() => reasonCode && onConfirm(reasonCode)}
            disabled={!reasonCode || submitting}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Saving…" : "Save & next"}
          </button>
        </div>
      </div>
    </div>
  );
}
