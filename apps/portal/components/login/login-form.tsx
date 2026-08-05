"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Couldn't reach the check service. Try again.");
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach the check service. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(26,24,21,0.04),0_8px_24px_-12px_rgba(26,24,21,0.08)]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">Email</span>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none disabled:opacity-50"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none disabled:opacity-50"
          />
        </label>

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="mt-5 w-full rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.25rem] px-1 text-center text-sm">
        {error && <span className="text-block">{error}</span>}
      </div>
    </form>
  );
}
