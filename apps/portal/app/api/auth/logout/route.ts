import { NextResponse } from "next/server";
import { xobriqFetch } from "@/lib/xobriq-server";
import { getSessionToken, clearSessionCookie } from "@/lib/session";

export async function POST() {
  const token = getSessionToken();
  if (token) {
    // Best-effort: invalidate server-side, but the cookie clears either way.
    await xobriqFetch("/v1/auth/logout", token, { method: "POST" }).catch(() => {});
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
