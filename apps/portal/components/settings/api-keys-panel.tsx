"use client";

import { useEffect, useState } from "react";
import type { ApiKeyView, MeResponse, RotateKeyResponse } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";

type LoadState = "loading" | "ready" | "error";

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RotateKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      const [keysRes, meRes] = await Promise.all([fetch("/api/keys"), fetch("/api/auth/me")]);
      if (!keysRes.ok) throw new Error("failed");
      const keysBody: { items: ApiKeyView[] } = await keysRes.json();
      setKeys(keysBody.items);
      setMe(meRes.ok ? await meRes.json() : null);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function rotate(id: string) {
    setRotating(id);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}/rotate`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "Couldn't rotate the key. Try again.");
        return;
      }
      setRevealed(body as RotateKeyResponse);
      setConfirmingId(null);
      await load();
    } catch {
      setError("Couldn't reach the check service. Try again.");
    } finally {
      setRotating(null);
    }
  }

  function copySecret() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (state === "loading") return <div className="py-10 text-center text-sm text-ink-soft">Loading keys…</div>;
  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-ink">Couldn't reach the check service. Try again.</p>
        <button onClick={load} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-hairline/40">
          Retry
        </button>
      </div>
    );
  }

  const isAdmin = me?.role === "admin";

  return (
    <div>
      {revealed && (
        <div className="mb-6 rounded-xl border border-step-up/30 bg-step-up-tint p-5">
          <h2 className="text-sm font-medium text-ink">New {revealed.mode} key — copy it now</h2>
          <p className="mt-1 text-xs text-ink-soft">This is the only time the full secret is shown. It won't be retrievable again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-hairline bg-surface px-3 py-2 font-mono text-xs text-ink">
              {revealed.secret}
            </code>
            <button
              onClick={copySecret}
              className="shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper transition-transform active:scale-[0.98]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setRevealed(null)} className="mt-3 text-xs text-ink-soft underline hover:text-ink">
            Done, dismiss
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-block">{error}</p>}

      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  key.mode === "live" ? "bg-block-tint text-block" : "bg-allow-tint text-allow"
                }`}
              >
                {key.mode === "live" ? "Live" : "Test"}
              </span>
              <code className="font-mono text-sm text-ink">{key.key_prefix}••••••••••••••••</code>
              {!key.is_active && <span className="text-xs text-ink-soft">(inactive)</span>}
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-ink-soft">
                Created {formatDateTime(key.created_at)}
                {key.last_used_at ? ` · used ${formatDateTime(key.last_used_at)}` : " · never used"}
              </span>
              {isAdmin && key.is_active && (
                <>
                  {confirmingId === key.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-soft">Invalidates the old key.</span>
                      <button
                        onClick={() => rotate(key.id)}
                        disabled={rotating === key.id}
                        className="rounded-lg bg-block px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
                      >
                        {rotating === key.id ? "Rotating…" : "Confirm rotate"}
                      </button>
                      <button onClick={() => setConfirmingId(null)} className="text-xs text-ink-soft hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(key.id)}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                    >
                      Rotate
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!isAdmin && <p className="mt-4 text-xs text-ink-soft">Only an admin can rotate keys.</p>}
    </div>
  );
}
