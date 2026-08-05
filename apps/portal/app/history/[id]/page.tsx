import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { xobriqFetch, XobriqApiError } from "@/lib/xobriq-server";
import { getSessionToken } from "@/lib/session";
import type { DecisionDetail } from "@/lib/api-types";
import { DecisionCore } from "@/components/check/decision-core";
import { formatDateTime } from "@/lib/format";

async function getDecision(id: string, token: string): Promise<DecisionDetail | null> {
  try {
    return await xobriqFetch<DecisionDetail>(`/v1/decisions/${id}`, token);
  } catch (error) {
    if (error instanceof XobriqApiError && error.status === 404) return null;
    throw error;
  }
}

export default async function HistoryDetailPage({ params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) redirect("/login");

  const decision = await getDecision(params.id, token);
  if (!decision) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/history" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        ← Back to history
      </Link>

      <DecisionCore decision={decision} subtitle={decision.reference_id ?? `Check ${decision.id.slice(0, 8)}`} />

      {decision.audit_trail.length > 0 && (
        <section className="mt-6 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink-soft">Audit trail</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {decision.audit_trail.map((entry) => (
              <li key={entry.seq} className="flex items-center justify-between font-mono text-xs text-ink-soft">
                <span>
                  #{entry.seq} · {entry.hash.slice(0, 12)}…
                </span>
                <span>{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex items-center gap-3 border-t border-hairline pt-6">
        <Link
          href={decision.reference_id ? `/?reference_id=${encodeURIComponent(decision.reference_id)}` : "/"}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform active:scale-[0.98]"
        >
          Re-check
        </Link>
        <span className="text-xs text-ink-soft">Runs a fresh check — the original decision is never changed.</span>
      </div>
    </div>
  );
}
