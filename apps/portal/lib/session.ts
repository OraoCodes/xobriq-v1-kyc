import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { XobriqApiError } from "./xobriq-server";

export const SESSION_COOKIE = "xobriq_session";

/** Server Components / Server Actions read the cookie this way. */
export function getSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/** Route handlers that require a session use this — throws straight into the existing toErrorResponse path. */
export function requireSessionToken(): string {
  const token = getSessionToken();
  if (!token) throw new XobriqApiError(401, "UNAUTHENTICATED", "Not logged in");
  return token;
}

const isProduction = process.env.NODE_ENV === "production";

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 0 });
}
