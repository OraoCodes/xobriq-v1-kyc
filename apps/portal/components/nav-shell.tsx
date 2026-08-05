"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StatsResponse, MeResponse } from "@/lib/api-types";

const LINKS = [
  { href: "/", label: "Run a check" },
  { href: "/history", label: "History" },
  { href: "/review", label: "Review queue" },
  { href: "/settings", label: "Settings" },
];

function StatsStrip() {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StatsResponse | null) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;

  const openReview = stats.by_action.REVIEW ?? 0;

  return (
    <div className="hidden items-center gap-1 font-mono text-xs text-ink-soft sm:flex">
      <span>{stats.total} checks</span>
      {openReview > 0 && (
        <>
          <span className="text-hairline">·</span>
          <span>{openReview} in review</span>
        </>
      )}
    </div>
  );
}

function AccountMenu() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => {
        // The middleware only checks that a session cookie is PRESENT, not
        // that it's still valid — a stale/expired/deleted session reaches
        // this component, and this 401 is the real "are you logged in"
        // signal. Self-heal into a clean login instead of a silently broken nav.
        if (res.status === 401) {
          // Clear the stale cookie too — otherwise the middleware's cheap
          // presence-only check keeps waving it through on every future visit.
          fetch("/api/auth/logout", { method: "POST" }).finally(() => {
            router.push("/login");
            router.refresh();
          });
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: MeResponse | null) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  if (!me) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-ink-soft md:inline">{me.customer_name ?? me.email}</span>
      <button
        onClick={signOut}
        disabled={signingOut}
        className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-hairline/60 hover:text-ink disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-hairline bg-paper">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <span className="font-mono text-sm font-medium tracking-tight text-ink">xobriq</span>
            {!isLoginPage && (
              <nav className="flex items-center gap-1" aria-label="Primary">
                {LINKS.map((link) => {
                  const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                        active ? "bg-ink text-paper" : "text-ink-soft hover:bg-hairline/60 hover:text-ink"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
          {!isLoginPage && (
            <div className="flex items-center gap-5">
              <StatsStrip />
              <AccountMenu />
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
