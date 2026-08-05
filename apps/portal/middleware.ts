import { NextResponse, type NextRequest } from "next/server";

// Duplicated from lib/session.ts deliberately — that module pulls in
// next/headers, which isn't meant for the Edge middleware runtime.
const SESSION_COOKIE = "xobriq_session";

/**
 * The single gate for every portal page. Individual pages ALSO check the
 * session server-side (defense in depth, and needed for the redirect logic
 * that reads decision data) — this middleware is what stops an unauthenticated
 * request from ever reaching a page render at all.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/history/:path*", "/review/:path*", "/settings/:path*"],
};
